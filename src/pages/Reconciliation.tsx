import { useCallback, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import toast from 'react-hot-toast';
import { useDrugs } from '@/hooks/useDrugs';
import {
  useReconciliationCycles,
  useReconciliationItems,
  useCreateCycleWithItems,
  useUpdateActualCount,
  useUpdateOpeningBalance,
  useCompleteCycle,
  useDeleteCycle,
  computeFlag,
} from '@/hooks/useReconciliation';
import { useReconciliationDraft } from '@/hooks/useReconciliationDraft';
import { useFileList } from '@/hooks/useFileList';
import { deduplicateDinData, mergeDinData, parseSingleFileWithPreview, type FilePreview } from '@/lib/fileParser';
import { createPackSizeResolver, getDinReferenceEntry, referenceLabel } from '@/lib/dinReference';
import { isSameDin, padDin } from '@/lib/din';
import { supabase } from '@/lib/supabase';
import type {
  CycleFormData,
  HistoryState,
  ParsedDinData,
  ReconciliationItemDraft,
} from '@/types/reconciliation';
import { EMPTY_CHECKLIST, DEFAULT_COUNT_LOCATIONS } from '@/types/reconciliation';
import CountLocationsModal from '@/components/CountLocationsModal';
import { LandingView } from '@/components/reconciliation/ReconciliationLanding';
import { TableView } from '@/components/reconciliation/ReconciliationTable';
import { DetailView } from '@/components/reconciliation/ReconciliationDetail';
import { PastCyclesView, DeleteDialog } from '@/components/reconciliation/ReconciliationHistory';
import { FilePreviewModal } from '@/components/reconciliation/FilePreviewModal';

type View = 'landing' | 'table' | 'past' | 'detail';
type Zone = 'mckesson' | 'kroll';
type EditableField = 'opening' | 'purchased' | 'dispensed';

/** Undo/redo depth for the counting table. */
const MAX_HISTORY = 50;

const EMPTY_CYCLE_FORM: CycleFormData = {
  start_date: '',
  end_date: '',
  performed_by: '',
  verified_by: '',
  notes: '',
  checklist: { ...EMPTY_CHECKLIST },
};

const expectedFor = (item: Pick<ReconciliationItemDraft, 'opening_balance' | 'purchased_count' | 'dispensed_count'>) =>
  item.opening_balance + item.purchased_count - item.dispensed_count;

export default function Reconciliation() {
  const { data: drugs } = useDrugs();
  const { data: cycles, isLoading: cyclesLoading } = useReconciliationCycles();

  const [view, setView] = useState<View>('landing');
  const [draftItems, setDraftItems] = useState<ReconciliationItemDraft[]>([]);

  const mckesson = useFileList();
  const kroll = useFileList();
  const [parsing, setParsing] = useState(false);
  const [filePreviews, setFilePreviews] = useState<{ mckesson: FilePreview[]; kroll: FilePreview[] }>({
    mckesson: [],
    kroll: [],
  });
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Opening balances
  const [startFromPreviousMode, setStartFromPreviousMode] = useState<'database' | 'file' | 'zero'>('zero');
  const [savedCountFile, setSavedCountFile] = useState<File | null>(null);
  const [savedCountDragOver, setSavedCountDragOver] = useState(false);
  const [savedCounts, setSavedCounts] = useState<Map<string, number>>(new Map());

  // Parsed data kept for deduplication across successive uploads
  const [existingMckessonData, setExistingMckessonData] = useState<Map<string, ParsedDinData>>(new Map());
  const [existingKrollData, setExistingKrollData] = useState<Map<string, ParsedDinData>>(new Map());
  const [existingDateRange, setExistingDateRange] = useState<{ start: Date | null; end: Date | null } | null>(null);
  const [skippedDuplicates, setSkippedDuplicates] = useState(0);

  // Inline editing of the counting table
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<EditableField | null>(null);

  const [cycleForm, setCycleForm] = useState<CycleFormData>(EMPTY_CYCLE_FORM);
  const [activeCycleId, setActiveCycleId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [selectedItemForVerify, setSelectedItemForVerify] = useState<number | null>(null);
  const [verifyNote, setVerifyNote] = useState('');
  const [locationEditIndex, setLocationEditIndex] = useState<number | null>(null);

  const createMutation = useCreateCycleWithItems();
  const completeMutation = useCompleteCycle();
  const deleteMutation = useDeleteCycle();
  const updateMutation = useUpdateActualCount();
  const openingMutation = useUpdateOpeningBalance();
  const { data: activeCycleItems } = useReconciliationItems(activeCycleId);

  const hasUploadedFiles = mckesson.files.length > 0 || kroll.files.length > 0;

  useReconciliationDraft({
    items: draftItems,
    enabled: draftItems.length > 0 && hasUploadedFiles && !!drugs,
    draftId: currentDraftId,
    onDraftCreated: setCurrentDraftId,
  });

  // ---------------------------------------------------------------- undo / redo

  // The ref mirrors the index so several edits in one tick cannot overwrite each other.
  const historyIndexRef = useRef(-1);

  const setIndex = useCallback((value: number) => {
    historyIndexRef.current = value;
    setHistoryIndex(value);
  }, []);

  const recordHistory = useCallback((snapshot: ReconciliationItemDraft[]) => {
    const currentIndex = historyIndexRef.current;

    setHistory((previous) => {
      const kept = previous.slice(0, currentIndex + 1);
      const capped = kept.length >= MAX_HISTORY ? kept.slice(kept.length - MAX_HISTORY + 1) : kept;
      return [...capped, { items: [...snapshot], timestamp: Date.now() }];
    });

    setIndex(Math.min(currentIndex + 1, MAX_HISTORY - 1));
  }, [setIndex]);

  const undo = useCallback(() => {
    const current = historyIndexRef.current;
    if (current <= 0) return;

    setDraftItems([...history[current - 1].items]);
    setIndex(current - 1);
    toast.success('Undo successful');
  }, [history, setIndex]);

  const redo = useCallback(() => {
    const current = historyIndexRef.current;
    if (current >= history.length - 1) return;

    setDraftItems([...history[current + 1].items]);
    setIndex(current + 1);
    toast.success('Redo successful');
  }, [history, setIndex]);

  // ---------------------------------------------------------------- derived data

  const filteredItems = useMemo(() => {
    if (!searchQuery) return draftItems;
    const query = searchQuery.toLowerCase();
    return draftItems.filter(
      (item) => item.din.includes(query) || (item.description ?? '').toLowerCase().includes(query)
    );
  }, [draftItems, searchQuery]);

  // Pack size per DIN: CDSA/DPD reference first, then the drug record's Pack Size.
  const packSizeFor = useMemo(() => createPackSizeResolver(drugs ?? []), [drugs]);

  const drugMap = useMemo(() => {
    const map = new Map<string, { id: string; description: string; schedule: string; current_stock: number; pack_size: number }>();
    for (const drug of drugs ?? []) {
      map.set(drug.din, {
        id: drug.id,
        description: drug.description,
        schedule: drug.schedule,
        current_stock: drug.current_stock,
        pack_size: drug.pack_size,
      });
    }
    return map;
  }, [drugs]);

  // ---------------------------------------------------------------- item editing

  /** Replaces one item and records the change for undo. */
  const updateItem = useCallback(
    (index: number, patch: (item: ReconciliationItemDraft) => ReconciliationItemDraft) => {
      const next = [...draftItems];
      next[index] = patch(next[index]);
      setDraftItems(next);
      recordHistory(next);
    },
    [draftItems, recordHistory]
  );

  const handleActualCountChange = (index: number, value: string) => {
    const parsed = value === '' ? null : parseInt(value, 10);
    if (parsed !== null && (isNaN(parsed) || parsed < 0)) return;

    updateItem(index, (item) => ({
      ...item,
      actual_count: parsed,
      flag: computeFlag(parsed, expectedFor(item), item.schedule),
    }));
  };

  const handleNoteChange = (index: number, value: string) => {
    updateItem(index, (item) => ({ ...item, note: value }));
  };

  const handleNumberEdit = (
    index: number,
    field: 'opening_balance' | 'purchased_count' | 'dispensed_count',
    value: string
  ) => {
    const parsed = value === '' ? 0 : parseInt(value, 10);
    if (isNaN(parsed) || parsed < 0) return;

    updateItem(index, (item) => {
      const updated: ReconciliationItemDraft = {
        ...item,
        opening_balance: field === 'opening_balance' ? parsed : item.opening_balance,
        purchased_count: field === 'purchased_count' ? parsed : item.purchased_count,
        dispensed_count: field === 'dispensed_count' ? parsed : item.dispensed_count,
      };
      return { ...updated, flag: computeFlag(updated.actual_count, expectedFor(updated), updated.schedule) };
    });
  };

  const handleEditClick = (index: number, field: EditableField) => {
    setEditingIndex(index);
    setEditingField(field);
  };

  const handleEditBlur = () => {
    setEditingIndex(null);
    setEditingField(null);
  };

  const toggleSelectAll = () => {
    const allSelected = filteredItems.length > 0 && filteredItems.every((item) => item.selected);
    setDraftItems((previous) => previous.map((item) => ({ ...item, selected: !allSelected })));
  };

  const toggleItemSelection = (index: number) => {
    setDraftItems((previous) => {
      const next = [...previous];
      next[index] = { ...next[index], selected: !next[index].selected };
      return next;
    });
  };

  const handleBulkEdit = (value: number | null) => {
    const next = draftItems.map((item) => {
      if (!item.selected) return item;
      return { ...item, actual_count: value, flag: computeFlag(value, expectedFor(item), item.schedule) };
    });

    setDraftItems(next);
    recordHistory(next);
    setBulkEditMode(false);
    toast.success(`Updated ${draftItems.filter((item) => item.selected).length} items`);
  };

  const handleVerifyItem = (index: number) => {
    setSelectedItemForVerify(index);
    setVerifyNote(draftItems[index].verify_note || '');
    setVerifyModalOpen(true);
  };

  const saveVerifyNote = () => {
    if (selectedItemForVerify === null) return;

    updateItem(selectedItemForVerify, (item) => ({ ...item, verify_note: verifyNote, flag: 'Verify' }));

    setVerifyModalOpen(false);
    setSelectedItemForVerify(null);
    setVerifyNote('');
    toast.success('Verification note saved');
  };

  const applyLocationCounts = (index: number, locations: ReconciliationItemDraft['locations'], total: number) => {
    updateItem(index, (item) => ({
      ...item,
      locations,
      actual_count: total,
      flag: computeFlag(total, expectedFor(item), item.schedule),
    }));
    setLocationEditIndex(null);
    toast.success('Location counts applied');
  };

  // ---------------------------------------------------------------- saved count file

  /** Reads the optional "saved counts" file the user supplies as an opening balance. */
  const parseSavedCountFile = async (file: File) => {
    try {
      const text = await file.text();
      const Papa = await import('papaparse');
      const result = Papa.parse(text, { header: true });

      const counts = new Map<string, number>();

      for (const row of result.data as Array<Record<string, unknown>>) {
        const rawDin = row['DIN'] ?? row['din'] ?? row['Drug Identification Number'] ?? row['Drug ID'];
        const rawActual = row['Actual'] ?? row['actual'] ?? row['ACTUAL'] ?? row['actual_count'];
        if (!rawDin || !rawActual) continue;

        const din = padDin(rawDin);
        const count = parseInt(String(rawActual).trim(), 10);

        if (din && !isNaN(count) && count > 0) counts.set(din, count);
      }

      setSavedCounts(counts);

      if (counts.size === 0) {
        toast.error('No valid counts found in saved count file. Please ensure the file has "DIN" and "Actual" columns.');
      } else {
        toast.success(`Loaded ${counts.size} saved counts from file`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse saved count file');
    }
  };

  const handleSavedCountDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
      toast.error('Saved count file must be .csv, .xlsx, or .xls');
      return;
    }

    setSavedCountFile(file);
    setSavedCountDragOver(false);
    void parseSavedCountFile(file);
  };

  const handleSavedCountSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSavedCountFile(file);
    void parseSavedCountFile(file);
  };

  const handleSavedCountClear = () => {
    setSavedCountFile(null);
    setSavedCounts(new Map());
  };

  // ---------------------------------------------------------------- import

  const handleProcessFiles = async () => {
    if (mckesson.files.length === 0 || kroll.files.length === 0) {
      toast.error('Please upload at least one McKesson and one Kroll file');
      return;
    }

    setParsing(true);
    try {
      // One shared signature set per source so a row repeated across files is only counted once.
      const mckessonSignatures = new Set<string>();
      const krollSignatures = new Set<string>();

      const { data: allMckessonData, previews: mckessonPreviews } = await parseZone(
        mckesson.files,
        'mckesson',
        mckessonSignatures,
        packSizeFor
      );
      const { data: allKrollData, previews: krollPreviews } = await parseZone(
        kroll.files,
        'kroll',
        krollSignatures,
        packSizeFor
      );

      const combinedDateRange = combinedRange([...mckessonPreviews, ...krollPreviews]);

      // Rows that overlap a range already imported are dropped, so re-uploading a
      // superset of an earlier file does not double-count.
      let mckessonData = allMckessonData;
      let krollData = allKrollData;
      let skippedCount = 0;

      if (existingMckessonData.size > 0 || existingKrollData.size > 0) {
        mckessonData = deduplicateDinData(existingMckessonData, allMckessonData, existingDateRange);
        krollData = deduplicateDinData(existingKrollData, allKrollData, existingDateRange);
        skippedCount =
          allMckessonData.size - mckessonData.size + (allKrollData.size - krollData.size);

        setSkippedDuplicates(skippedCount);
        if (skippedCount > 0) {
          toast.success(`Skipped ${skippedCount} duplicate transactions from overlapping date ranges`);
        }
      }

      setExistingMckessonData(mckessonData);
      setExistingKrollData(krollData);
      setExistingDateRange(combinedDateRange);
      setFilePreviews({ mckesson: mckessonPreviews, kroll: krollPreviews });
      setShowPreviewModal(true);

      const merged = mergeDinData(mckessonData, krollData);
      if (merged.size === 0) {
        toast.error('No valid DIN data found in the uploaded files after deduplication');
        setShowPreviewModal(false);
        return;
      }

      const openingBalances = await resolveOpeningBalances(startFromPreviousMode, cycles ?? [], savedCounts, merged);

      const items: ReconciliationItemDraft[] = [];
      for (const [din, data] of merged) {
        const drug = drugMap.get(din);
        const reference = getDinReferenceEntry(din);

        // Description and schedule come from the drug record, then the CDSA/DPD
        // reference, then the text inside the uploaded file.
        const drugDescription =
          drug?.description && !drug.description.startsWith('Imported DIN')
            ? drug.description
            : reference
              ? referenceLabel(reference) || undefined
              : undefined;

        items.push({
          din,
          drug_id: drug?.id ?? null,
          description: drugDescription ?? data.description ?? 'Unknown drug',
          schedule: drug?.schedule && drug.schedule !== 'Verify' ? drug.schedule : reference?.schedule ?? 'Verify',
          opening_balance: openingBalances.get(din) ?? 0,
          purchased_count: data.purchased,
          dispensed_count: data.dispensed,
          actual_count: null,
          flag: 'Pending count',
          locations: DEFAULT_COUNT_LOCATIONS.map((location) => ({ ...location })),
        });
      }

      items.sort((a, b) => a.din.localeCompare(b.din));
      setDraftItems(items);

      const skippedMsg = skippedCount > 0 ? ` (${skippedCount} duplicate transactions skipped)` : '';
      toast.success(
        `${items.length} DINs imported from ${mckesson.files.length} McKesson and ${kroll.files.length} Kroll file(s)${skippedMsg}. Confirm the preview to start the cycle.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse files');
    } finally {
      setParsing(false);
    }
  };

  const handleConfirmPreview = () => {
    if (draftItems.length === 0) {
      toast.error('No items to reconcile. Please upload files again.');
      setShowPreviewModal(false);
      return;
    }

    setShowPreviewModal(false);
    setView('table');
    const skippedMsg = skippedDuplicates > 0 ? ` (${skippedDuplicates} duplicates skipped)` : '';
    toast.success(`Starting reconciliation with ${draftItems.length} items${skippedMsg}`);
  };

  const resetImport = () => {
    setExistingMckessonData(new Map());
    setExistingKrollData(new Map());
    setExistingDateRange(null);
    setSkippedDuplicates(0);
    setDraftItems([]);
    mckesson.clear();
    kroll.clear();
    setFilePreviews({ mckesson: [], kroll: [] });
    handleSavedCountClear();
    setStartFromPreviousMode('zero');
  };

  const handleClearAndReset = () => {
    resetImport();
    toast.success('Cleared all data. Ready for fresh upload.');
  };

  // ---------------------------------------------------------------- cycles

  const handleSavedActualCountBlur = async (itemId: string, value: string) => {
    const parsed = value === '' ? null : parseInt(value, 10);
    if (parsed !== null && (isNaN(parsed) || parsed < 0)) return;

    try {
      await updateMutation.mutateAsync({ itemId, actualCount: parsed });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleSavedOpeningBlur = async (itemId: string, value: string) => {
    const parsed = value === '' ? 0 : parseInt(value, 10);
    if (isNaN(parsed) || parsed < 0) return;

    try {
      await openingMutation.mutateAsync({ itemId, openingBalance: parsed });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update opening count');
    }
  };

  const handleSaveCycle = async () => {
    if (draftItems.length === 0) {
      toast.error('No items to save');
      return;
    }

    try {
      const result = await createMutation.mutateAsync({ formData: cycleForm, items: draftItems });
      toast.success('Reconciliation cycle saved');
      setActiveCycleId(result.cycleId);
      setView('detail');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save cycle');
    }
  };

  const handleCompleteCycle = async () => {
    if (!activeCycleId) return;

    try {
      await completeMutation.mutateAsync({ cycleId: activeCycleId, formData: cycleForm });
      toast.success('Reconciliation cycle completed');
      setView('past');
      setActiveCycleId(null);
      resetImport();
      setCycleForm(EMPTY_CYCLE_FORM);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to complete cycle');
    }
  };

  const handleDeleteCycle = async () => {
    if (!deleteTarget) return;

    try {
      await deleteMutation.mutateAsync(deleteTarget);
      toast.success('Cycle deleted');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete cycle');
    }
  };

  const startNewCycle = () => {
    resetImport();
    setView('landing');
  };

  // ---------------------------------------------------------------- render

  if (view === 'landing') {
    const zone = (name: Zone) => (name === 'mckesson' ? mckesson : kroll);

    return (
      <>
        <LandingView
          mckessonFiles={mckesson.files}
          krollFiles={kroll.files}
          mckessonDragOver={mckesson.dragOver}
          krollDragOver={kroll.dragOver}
          parsing={parsing}
          cycles={cycles ?? []}
          cyclesLoading={cyclesLoading}
          startFromPreviousMode={startFromPreviousMode}
          drugCount={drugs?.length ?? 0}
          packedDrugCount={(drugs ?? []).filter((drug) => drug.pack_size > 1).length}
          savedCountFile={savedCountFile}
          savedCountDragOver={savedCountDragOver}
          hasExistingData={existingMckessonData.size > 0 || existingKrollData.size > 0}
          onDrop={(event, name) => zone(name).handleDrop(event)}
          onDragOver={(event, name) => {
            event.preventDefault();
            zone(name).setDragOver(true);
          }}
          onDragLeave={(name) => zone(name).setDragOver(false)}
          onFileSelect={(event, name) => zone(name).handleSelect(event)}
          onRemoveFile={(index, name) => zone(name).remove(index)}
          onClearAllFiles={(name) => zone(name).clear()}
          onSavedCountDrop={handleSavedCountDrop}
          onSavedCountDragOver={(event) => {
            event.preventDefault();
            setSavedCountDragOver(true);
          }}
          onSavedCountDragLeave={() => setSavedCountDragOver(false)}
          onSavedCountSelect={handleSavedCountSelect}
          onSavedCountClear={handleSavedCountClear}
          onProcess={handleProcessFiles}
          onViewPast={() => setView('past')}
          onClearAll={handleClearAndReset}
          onStartFromPreviousModeChange={setStartFromPreviousMode}
        />

        {showPreviewModal && (
          <FilePreviewModal
            previews={filePreviews}
            itemCount={draftItems.length}
            onConfirm={handleConfirmPreview}
            onCancel={() => {
              setShowPreviewModal(false);
              setFilePreviews({ mckesson: [], kroll: [] });
            }}
          />
        )}
      </>
    );
  }

  if (view === 'table') {
    return (
      <>
        <TableView
          items={draftItems}
          filteredItems={filteredItems}
          cycleForm={cycleForm}
          onFormChange={setCycleForm}
          onActualCountChange={handleActualCountChange}
          onNoteChange={handleNoteChange}
          onSave={handleSaveCycle}
          onBack={() => setView('landing')}
          saving={createMutation.isPending}
          onSearchChange={setSearchQuery}
          onToggleBulkEdit={() => setBulkEditMode((open) => !open)}
          bulkEditMode={bulkEditMode}
          onToggleSelectAll={toggleSelectAll}
          allSelected={filteredItems.length > 0 && filteredItems.every((item) => item.selected)}
          selectedCount={draftItems.filter((item) => item.selected).length}
          onToggleItemSelection={toggleItemSelection}
          onBulkEdit={handleBulkEdit}
          onUndo={undo}
          onRedo={redo}
          canUndo={historyIndex > 0}
          canRedo={historyIndex < history.length - 1}
          onVerifyItem={handleVerifyItem}
          verifyModalOpen={verifyModalOpen}
          onCloseVerifyModal={() => {
            setVerifyModalOpen(false);
            setSelectedItemForVerify(null);
            setVerifyNote('');
          }}
          verifyNote={verifyNote}
          onVerifyNoteChange={setVerifyNote}
          onSaveVerifyNote={saveVerifyNote}
          searchQuery={searchQuery}
          onOpenLocations={(din) => {
            const index = draftItems.findIndex((item) => item.din === din);
            setLocationEditIndex(index >= 0 ? index : null);
          }}
          editingIndex={editingIndex}
          editingField={editingField}
          onEditClick={handleEditClick}
          onOpeningEdit={(index, value) => handleNumberEdit(index, 'opening_balance', value)}
          onPurchasedEdit={(index, value) => handleNumberEdit(index, 'purchased_count', value)}
          onDispensedEdit={(index, value) => handleNumberEdit(index, 'dispensed_count', value)}
          onEditBlur={handleEditBlur}
        />

        {locationEditIndex !== null && draftItems[locationEditIndex] && (
          <CountLocationsModal
            item={draftItems[locationEditIndex]}
            onClose={() => setLocationEditIndex(null)}
            onSave={(locations, total) => applyLocationCounts(locationEditIndex, locations, total)}
          />
        )}
      </>
    );
  }

  if (view === 'detail' && activeCycleId) {
    return (
      <DetailView
        items={activeCycleItems ?? []}
        onActualCountBlur={handleSavedActualCountBlur}
        onOpeningBlur={handleSavedOpeningBlur}
        onComplete={handleCompleteCycle}
        onBack={() => setView('past')}
        completing={completeMutation.isPending}
        updating={updateMutation.isPending || openingMutation.isPending}
      />
    );
  }

  if (view === 'past') {
    return (
      <>
        <PastCyclesView
          cycles={cycles ?? []}
          loading={cyclesLoading}
          onViewCycle={(id) => {
            setActiveCycleId(id);
            setView('detail');
          }}
          onNewCycle={startNewCycle}
          onDeleteCycle={setDeleteTarget}
        />

        {deleteTarget && (
          <DeleteDialog
            onCancel={() => setDeleteTarget(null)}
            onConfirm={handleDeleteCycle}
            deleting={deleteMutation.isPending}
          />
        )}
      </>
    );
  }

  return null;
}

// ------------------------------------------------------------------ helpers

/** Parses every file in one zone and merges the results into a single DIN map. */
async function parseZone(
  files: File[],
  source: 'mckesson' | 'kroll',
  seenSignatures: Set<string>,
  packSizeFor: (din: string) => number | null
): Promise<{ data: Map<string, ParsedDinData>; previews: FilePreview[] }> {
  const data = new Map<string, ParsedDinData>();
  const previews: FilePreview[] = [];

  for (const file of files) {
    const parsed = await parseSingleFileWithPreview(file, source, seenSignatures, packSizeFor);

    for (const [din, incoming] of parsed.data) {
      const existing = data.get(din);
      if (!existing) {
        data.set(din, incoming);
        continue;
      }
      existing.purchased += incoming.purchased;
      existing.dispensed += incoming.dispensed;
      existing.transactions = [...(existing.transactions ?? []), ...(incoming.transactions ?? [])];
    }

    previews.push(parsed.preview);
  }

  return { data, previews };
}

/** The widest date range covered by a set of file previews. */
function combinedRange(previews: FilePreview[]): { start: Date | null; end: Date | null } {
  const range: { start: Date | null; end: Date | null } = { start: null, end: null };

  for (const preview of previews) {
    const { start, end } = preview.dateRange ?? { start: null, end: null };
    if (start && (!range.start || start < range.start)) range.start = start;
    if (end && (!range.end || end > range.end)) range.end = end;
  }

  return range;
}

/** Opening balances for the merged DINs, based on the chosen starting-count mode. */
async function resolveOpeningBalances(
  mode: 'database' | 'file' | 'zero',
  cycles: Array<{ id: string; status: string }>,
  savedCounts: Map<string, number>,
  merged: Map<string, { purchased: number; dispensed: number }>
): Promise<Map<string, number>> {
  const balances = new Map<string, number>();

  if (mode === 'database') {
    const previousCycle = cycles.find((cycle) => cycle.status === 'completed');
    if (!previousCycle) return balances;

    const { data } = await supabase
      .from('reconciliation_items')
      .select('din, actual_count')
      .eq('cycle_id', previousCycle.id)
      .not('actual_count', 'is', null);

    for (const item of data ?? []) {
      if (item.actual_count !== null) balances.set(item.din, item.actual_count);
    }
    return balances;
  }

  if (mode === 'file') {
    const mergedDins = [...merged.keys()];
    for (const [savedDin, count] of savedCounts) {
      if (merged.has(savedDin)) {
        balances.set(savedDin, count);
        continue;
      }
      // The file and the export often disagree on leading zeros.
      const match = mergedDins.find((din) => isSameDin(din, savedDin));
      if (match) balances.set(match, count);
    }
  }

  return balances;
}
