import { useState, useMemo, useCallback, useEffect, type DragEvent } from 'react';
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
import { mergeDinData, deduplicateDinData, parseSingleFileWithPreview, type FilePreview } from '@/lib/fileParser';
import { createPackSizeResolver, getDinReferenceEntry, referenceLabel } from '@/lib/dinReference';
import { supabase } from '@/lib/supabase';
import type { ReconciliationItemDraft, CycleFormData, HistoryState } from '@/types/reconciliation';
import { EMPTY_CHECKLIST, DEFAULT_COUNT_LOCATIONS } from '@/types/reconciliation';
import CountLocationsModal from '@/components/CountLocationsModal';
import { LandingView } from '@/components/reconciliation/ReconciliationLanding';
import { TableView } from '@/components/reconciliation/ReconciliationTable';
import { DetailView } from '@/components/reconciliation/ReconciliationDetail';
import { PastCyclesView, DeleteDialog } from '@/components/reconciliation/ReconciliationHistory';
import { FilePreviewModal } from '@/components/reconciliation/FilePreviewModal';

type View = 'landing' | 'table' | 'past' | 'detail';

// History management for undo/redo
const MAX_HISTORY = 50;

export default function Reconciliation() {
  const { data: drugs } = useDrugs();
  const { data: cycles, isLoading: cyclesLoading } = useReconciliationCycles();

  const [view, setView] = useState<View>('landing');
  const [draftItems, setDraftItems] = useState<ReconciliationItemDraft[]>([]);

  // Multiple files per zone support
  const [mckessonFiles, setMckessonFiles] = useState<File[]>([]);
  const [krollFiles, setKrollFiles] = useState<File[]>([]);
  const [parsing, setParsing] = useState(false);
  const [mckessonDragOver, setMckessonDragOver] = useState(false);
  const [krollDragOver, setKrollDragOver] = useState(false);
  const [filePreviews, setFilePreviews] = useState<{
    mckesson: FilePreview[];
    kroll: FilePreview[];
  }>({ mckesson: [], kroll: [] });
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Saved count file upload
  const [startFromPrevious, setStartFromPrevious] = useState(false);
  const [startFromPreviousMode, setStartFromPreviousMode] = useState<'database' | 'file' | 'zero'>('zero');
  const [savedCountFile, setSavedCountFile] = useState<File | null>(null);
  const [savedCountDragOver, setSavedCountDragOver] = useState(false);
  const [savedCounts, setSavedCounts] = useState<Map<string, number>>(new Map());

  // Store existing parsed data for deduplication
  const [existingMckessonData, setExistingMckessonData] = useState<Map<string, any>>(new Map());
  const [existingKrollData, setExistingKrollData] = useState<Map<string, any>>(new Map());
  const [existingDateRange, setExistingDateRange] = useState<{ start: Date | null; end: Date | null } | null>(null);
  const [skippedDuplicates, setSkippedDuplicates] = useState(0);

  // Edit functionality for opening/purchased/dispensed columns
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<'opening' | 'purchased' | 'dispensed' | null>(null);

  const [cycleForm, setCycleForm] = useState<CycleFormData>({
    start_date: '',
    end_date: '',
    performed_by: '',
    verified_by: '',
    notes: '',
    checklist: { ...EMPTY_CHECKLIST },
  });

  const [activeCycleId, setActiveCycleId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);

  // New states for enhanced features
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [selectedItemForVerify, setSelectedItemForVerify] = useState<number | null>(null);
  const [verifyNote, setVerifyNote] = useState('');

  const createMutation = useCreateCycleWithItems();
  const completeMutation = useCompleteCycle();
  const deleteMutation = useDeleteCycle();
  const updateMutation = useUpdateActualCount();
  const openingMutation = useUpdateOpeningBalance();
  const [locationEditIndex, setLocationEditIndex] = useState<number | null>(null);
  const { data: activeCycleItems } = useReconciliationItems(activeCycleId);

  // Auto-save draft functionality
  useEffect(() => {
    const autoSaveDraft = async () => {
      if (draftItems.length === 0 || !drugs) return;

      // Only auto-save if we have meaningful data (files uploaded and processed)
      if (mckessonFiles.length === 0 && krollFiles.length === 0) return;

      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;

        if (currentDraftId) {
          // Update existing draft
          const { error } = await supabase
            .from('reconciliation_items')
            .upsert(
              draftItems.map(item => ({
                cycle_id: currentDraftId,
                user_id: userData.user.id,
                drug_id: item.drug_id,
                din: item.din,
                description: item.description,
                schedule: item.schedule,
                opening_balance: item.opening_balance,
                purchased_count: item.purchased_count,
                dispensed_count: item.dispensed_count,
                actual_count: item.actual_count,
                flag: item.flag,
                verify_note: item.verify_note,
                locations: item.locations,
              }))
            );

          if (error) {
            console.error('Auto-save draft error:', error);
          }
        } else {
          // Create new draft cycle
          const { data: newCycle, error: cycleError } = await supabase
            .from('reconciliation_cycles')
            .insert({
              user_id: userData.user.id,
              status: 'draft',
              name: `Draft - ${new Date().toLocaleDateString()}`,
              start_date: new Date().toISOString(),
            })
            .select()
            .single();

          if (cycleError) {
            console.error('Error creating draft cycle:', cycleError);
            return;
          }

          setCurrentDraftId(newCycle.id);

          // Save items to the new draft
          const { error: itemsError } = await supabase
            .from('reconciliation_items')
            .insert(
              draftItems.map(item => ({
                cycle_id: newCycle.id,
                user_id: userData.user.id,
                drug_id: item.drug_id,
                din: item.din,
                description: item.description,
                schedule: item.schedule,
                opening_balance: item.opening_balance,
                purchased_count: item.purchased_count,
                dispensed_count: item.dispensed_count,
                actual_count: item.actual_count,
                flag: item.flag,
                verify_note: item.verify_note,
                locations: item.locations,
              }))
            );

          if (itemsError) {
            console.error('Error saving draft items:', itemsError);
          }
        }
      } catch (error) {
        console.error('Auto-save error:', error);
      }
    };

    // Auto-save every 30 seconds
    const interval = setInterval(autoSaveDraft, 30000);
    return () => clearInterval(interval);
  }, [draftItems, mckessonFiles, krollFiles, currentDraftId, drugs]);

  // Save draft on page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (draftItems.length > 0 && (mckessonFiles.length > 0 || krollFiles.length > 0)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [draftItems, mckessonFiles, krollFiles]);

  // History management
  const addToHistory = useCallback((items: ReconciliationItemDraft[]) => {
    const newState: HistoryState = {
      items: JSON.parse(JSON.stringify(items)),
      timestamp: Date.now(),
    };

    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      if (newHistory.length >= MAX_HISTORY) {
        newHistory.shift();
      }
      return [...newHistory, newState];
    });
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const previousState = history[historyIndex - 1];
      setDraftItems(JSON.parse(JSON.stringify(previousState.items)));
      setHistoryIndex(historyIndex - 1);
      toast.success('Undo successful');
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setDraftItems(JSON.parse(JSON.stringify(nextState.items)));
      setHistoryIndex(historyIndex + 1);
      toast.success('Redo successful');
    }
  }, [history, historyIndex]);

  // Filter items based on search
  const filteredItems = useMemo(() => {
    if (!searchQuery) return draftItems;
    const query = searchQuery.toLowerCase();
    return draftItems.filter(item =>
      item.din.includes(query) ||
      (item.description ?? '').toLowerCase().includes(query)
    );
  }, [draftItems, searchQuery]);

  // Calculate progress
  const progress = useMemo(() => {
    if (draftItems.length === 0) return 0;
    const counted = draftItems.filter(item => item.actual_count !== null).length;
    return Math.round((counted / draftItems.length) * 100);
  }, [draftItems]);

  // Handle verify workflow
  const handleVerifyItem = useCallback((index: number) => {
    setSelectedItemForVerify(index);
    setVerifyNote(draftItems[index].verify_note || '');
    setVerifyModalOpen(true);
  }, [draftItems]);

  const saveVerifyNote = useCallback(() => {
    if (selectedItemForVerify !== null) {
      setDraftItems(prev => {
        const next = [...prev];
        next[selectedItemForVerify] = {
          ...next[selectedItemForVerify],
          verify_note: verifyNote,
          flag: 'Verify',
        };
        addToHistory(next);
        return next;
      });
      setVerifyModalOpen(false);
      setSelectedItemForVerify(null);
      setVerifyNote('');
      toast.success('Verification note saved');
    }
  }, [selectedItemForVerify, verifyNote, addToHistory]);

  // Bulk edit functionality
  const handleBulkEdit = useCallback((value: number | null) => {
    setDraftItems(prev => {
      const next = prev.map(item => {
        if (item.selected) {
          const expected = item.opening_balance + item.purchased_count - item.dispensed_count;
          return {
            ...item,
            actual_count: value,
            flag: computeFlag(value, expected, item.schedule),
          };
        }
        return item;
      });
      addToHistory(next);
      return next;
    });
    setBulkEditMode(false);
    toast.success(`Updated ${draftItems.filter(i => i.selected).length} items`);
  }, [draftItems, addToHistory]);

  const toggleSelectAll = useCallback(() => {
    const allSelected = filteredItems.every(item => item.selected);
    setDraftItems(prev => prev.map(item => ({
      ...item,
      selected: !allSelected,
    })));
  }, [filteredItems]);

  const toggleItemSelection = useCallback((index: number) => {
    setDraftItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], selected: !next[index].selected };
      return next;
    });
  }, []);

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

  const handleFileDrop = useCallback(
    (e: DragEvent<HTMLDivElement>, zone: 'mckesson' | 'kroll') => {
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length === 0) return;

      const validFiles = files.filter(file => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        return ext === 'csv' || ext === 'xlsx' || ext === 'xls';
      });

      if (validFiles.length === 0) {
        toast.error('Files must be .csv, .xlsx, or .xls');
        return;
      }

      if (zone === 'mckesson') {
        setMckessonFiles(prev => [...prev, ...validFiles]);
        setMckessonDragOver(false);
      } else {
        setKrollFiles(prev => [...prev, ...validFiles]);
        setKrollDragOver(false);
      }
    },
    []
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, zone: 'mckesson' | 'kroll') => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (zone === 'mckesson') {
      setMckessonFiles(prev => [...prev, ...files]);
    } else {
      setKrollFiles(prev => [...prev, ...files]);
    }
  };

  const handleRemoveFile = (index: number, zone: 'mckesson' | 'kroll') => {
    if (zone === 'mckesson') {
      setMckessonFiles(prev => prev.filter((_, i) => i !== index));
    } else {
      setKrollFiles(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleClearAllFiles = (zone: 'mckesson' | 'kroll') => {
    if (zone === 'mckesson') {
      setMckessonFiles([]);
    } else {
      setKrollFiles([]);
    }
  };

  // Saved count file handlers
  const handleSavedCountDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
        toast.error('Saved count file must be .csv, .xlsx, or .xls');
        return;
      }
      setSavedCountFile(file);
      setSavedCountDragOver(false);
      // Automatically parse the file when dropped
      handleParseSavedCountFile();
    },
    []
  );

  const handleSavedCountSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSavedCountFile(file);
    // Automatically parse the file when selected
    handleParseSavedCountFile();
  };

  const handleParseSavedCountFile = async () => {
    if (!savedCountFile) return;

    try {
      // Parse the saved count file as CSV directly to access "Actual" column
      const text = await savedCountFile.text();
      const Papa = await import('papaparse');
      const result = Papa.parse(text, { header: true });

      const counts = new Map<string, number>();

      // Look for DIN and Actual columns with multiple possible names
      for (const row of result.data as any[]) {
        const din = row['DIN'] || row['din'] || row['Drug Identification Number'] || row['Drug ID'];
        const actualCount = row['Actual'] || row['actual'] || row['ACTUAL'] || row['actual_count'];

        if (din && actualCount) {
          // Normalize DIN to handle leading zeros and formatting
          let normalizedDin = din.toString().trim();

          // Pad to 8 digits if it's a shorter DIN
          if (normalizedDin.length < 8 && /^\d+$/.test(normalizedDin)) {
            normalizedDin = normalizedDin.padStart(8, '0');
          }

          const count = parseInt(actualCount.toString().trim(), 10);

          if (!isNaN(count) && count > 0) {
            counts.set(normalizedDin, count);
          }
        }
      }

      setSavedCounts(counts);

      if (counts.size === 0) {
        toast.error('No valid counts found in saved count file. Please ensure the file has "DIN" and "Actual" columns.');
      } else {
        toast.success(`Loaded ${counts.size} saved counts from file`);
      }
    } catch (err) {
      console.error('Error parsing saved count file:', err);
      const message = err instanceof Error ? err.message : 'Failed to parse saved count file';
      toast.error(message);
    }
  };

  const handleProcessFiles = async () => {
    if (mckessonFiles.length === 0 || krollFiles.length === 0) {
      toast.error('Please upload at least one McKesson and one Kroll file');
      return;
    }

    setParsing(true);
    try {
      // Create SHARED deduplication sets for each file type (to catch duplicates across multiple files)
      const mckessonSignatures = new Set<string>();
      const krollSignatures = new Set<string>();

      // Process all McKesson files
      const allMckessonData = new Map<string, any>();
      const mckessonPreviews: FilePreview[] = [];

      for (const file of mckessonFiles) {
        // Pass the SHARED signature set so duplicates across files are caught
        const { data, preview } = await parseSingleFileWithPreview(file, 'mckesson', mckessonSignatures, packSizeFor);

        for (const [din, itemData] of data) {
          const existing = allMckessonData.get(din);
          if (existing) {
            existing.purchased += itemData.purchased;
            existing.dispensed += itemData.dispensed;
            existing.transactions = [...(existing.transactions || []), ...(itemData.transactions || [])];
          } else {
            allMckessonData.set(din, itemData);
          }
        }

        if (preview) mckessonPreviews.push(preview);
      }

      // Process all Kroll files
      const allKrollData = new Map<string, any>();
      const krollPreviews: FilePreview[] = [];

      for (const file of krollFiles) {
        // Pass the SHARED signature set so duplicates across files are caught
        const { data, preview } = await parseSingleFileWithPreview(file, 'kroll', krollSignatures, packSizeFor);

        for (const [din, itemData] of data) {
          const existing = allKrollData.get(din);
          if (existing) {
            existing.purchased += itemData.purchased;
            existing.dispensed += itemData.dispensed;
            existing.transactions = [...(existing.transactions || []), ...(itemData.transactions || [])];
          } else {
            allKrollData.set(din, itemData);
          }
        }

        if (preview) krollPreviews.push(preview);
      }

      // Calculate combined date range
      const combinedDateRange: { start: Date | null; end: Date | null } = { start: null, end: null };

      for (const preview of [...mckessonPreviews, ...krollPreviews]) {
        if (preview.dateRange?.start && (!combinedDateRange.start || preview.dateRange.start < combinedDateRange.start)) {
          combinedDateRange.start = preview.dateRange.start;
        }
        if (preview.dateRange?.end && (!combinedDateRange.end || preview.dateRange.end > combinedDateRange.end)) {
          combinedDateRange.end = preview.dateRange.end;
        }
      }

      // Deduplicate if we have existing data
      let deduplicatedMckesson: Map<string, any>;
      let deduplicatedKroll: Map<string, any>;
      let skippedCount = 0;

      if (existingMckessonData.size > 0 || existingKrollData.size > 0) {
        const originalMckessonSize = allMckessonData.size;
        const originalKrollSize = allKrollData.size;

        deduplicatedMckesson = deduplicateDinData(existingMckessonData, allMckessonData, existingDateRange);
        deduplicatedKroll = deduplicateDinData(existingKrollData, allKrollData, existingDateRange);

        skippedCount = (originalMckessonSize - deduplicatedMckesson.size) + (originalKrollSize - deduplicatedKroll.size);
        setSkippedDuplicates(skippedCount);

        if (skippedCount > 0) {
          toast.success(`Skipped ${skippedCount} duplicate transactions from overlapping date ranges`);
        }
      } else {
        // No existing data, use the parsed data as-is
        deduplicatedMckesson = allMckessonData;
        deduplicatedKroll = allKrollData;
      }

      // Store the new data as existing for future uploads
      setExistingMckessonData(deduplicatedMckesson);
      setExistingKrollData(deduplicatedKroll);
      setExistingDateRange(combinedDateRange);

      // Set previews and show modal
      setFilePreviews({ mckesson: mckessonPreviews, kroll: krollPreviews });
      setShowPreviewModal(true);

      // Store the parsed data for later use
      const merged = mergeDinData(deduplicatedMckesson, deduplicatedKroll);

      if (merged.size === 0) {
        toast.error('No valid DIN data found in the uploaded files after deduplication');
        setParsing(false);
        setShowPreviewModal(false);
        return;
      }

      // Get opening balances based on selected mode
      const openingBalances = new Map<string, number>();

      if (startFromPreviousMode === 'database') {
        const previousCompletedCycle = cycles?.find(c => c.status === 'completed');
        if (previousCompletedCycle) {
          const { data: previousItems } = await supabase
            .from('reconciliation_items')
            .select('din, actual_count')
            .eq('cycle_id', previousCompletedCycle.id)
            .not('actual_count', 'is', null);

          if (previousItems) {
            for (const item of previousItems) {
              if (item.actual_count !== null) {
                openingBalances.set(item.din, item.actual_count);
              }
            }
          }
        }
      } else if (startFromPreviousMode === 'file') {
        // Try to match DINs with different normalization
        for (const [savedDin, count] of savedCounts) {
          // Try exact match first
          if (merged.has(savedDin)) {
            openingBalances.set(savedDin, count);
          } else {
            // Try with leading zeros variations
            for (const [mergedDin] of merged.keys()) {
              // Remove leading zeros for comparison
              const savedDinNoLeading = savedDin.replace(/^0+/, '');
              const mergedDinNoLeading = mergedDin.replace(/^0+/, '');

              if (savedDinNoLeading === mergedDinNoLeading) {
                openingBalances.set(mergedDin, count);
                break;
              }
            }
          }
        }
      }
      // 'zero' mode uses 0 by default

      const items: ReconciliationItemDraft[] = [];
      for (const [din, data] of merged) {
        const drug = drugMap.get(din);
        const openingBalance = openingBalances.get(din) ?? 0;

        // Description and schedule come from the drug record, then the CDSA/DPD
        // reference, then the text inside the uploaded file.
        const reference = getDinReferenceEntry(din);
        const drugDescription =
          drug?.description && !drug.description.startsWith('Imported DIN')
            ? drug.description
            : reference
              ? referenceLabel(reference) || undefined
              : undefined;
        const description = drugDescription ?? (data.description as string | undefined) ?? 'Unknown drug';
        const schedule =
          drug?.schedule && drug.schedule !== 'Verify' ? drug.schedule : reference?.schedule ?? 'Verify';

        items.push({
          din,
          drug_id: drug?.id ?? null,
          description: description,
          schedule: schedule,
          opening_balance: openingBalance,
          purchased_count: data.purchased,
          dispensed_count: data.dispensed,
          actual_count: null,
          flag: 'Pending count',
          locations: DEFAULT_COUNT_LOCATIONS.map((l) => ({ ...l })),
        });
      }

      items.sort((a, b) => a.din.localeCompare(b.din));
      setDraftItems(items);

      const message = skippedCount > 0
        ? `${items.length} DINs imported from ${mckessonFiles.length} McKesson and ${krollFiles.length} Kroll file(s) (${skippedCount} duplicate transactions skipped). Confirm the preview to start the cycle.`
        : `${items.length} DINs imported from ${mckessonFiles.length} McKesson and ${krollFiles.length} Kroll file(s). Confirm the preview to start the cycle.`;
      toast.success(message);
    } catch (err) {
      console.error('Error processing files:', err);
      const message = err instanceof Error ? err.message : 'Failed to parse files';
      toast.error(message);
    }
    setParsing(false);
  };

  const computeExpected = (item: { opening_balance: number; purchased_count: number; dispensed_count: number }): number =>
    item.opening_balance + item.purchased_count - item.dispensed_count;

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

  const handleClearAndReset = () => {
    setExistingMckessonData(new Map());
    setExistingKrollData(new Map());
    setExistingDateRange(null);
    setSkippedDuplicates(0);
    setDraftItems([]);
    setMckessonFiles([]);
    setKrollFiles([]);
    setFilePreviews({ mckesson: [], kroll: [] });
    setSavedCountFile(null);
    setSavedCounts(new Map());
    setStartFromPreviousMode('zero');
    toast.success('Cleared all data. Ready for fresh upload.');
  };

  const handleActualCountChange = (index: number, value: string) => {
    setDraftItems((prev) => {
      const next = [...prev];
      const item = { ...next[index] };
      const numValue = value === '' ? null : parseInt(value);
      if (numValue !== null && (isNaN(numValue) || numValue < 0)) return prev;
      item.actual_count = numValue;
      item.flag = computeFlag(numValue, computeExpected(item), item.schedule);
      next[index] = item;
      addToHistory(next);
      return next;
    });
  };

  const handleNoteChange = (index: number, value: string) => {
    setDraftItems((prev) => {
      const next = [...prev];
      const item = { ...next[index] };
      item.note = value;
      next[index] = item;
      addToHistory(next);
      return next;
    });
  };

  const handleOpeningEdit = (index: number, value: string) => {
    const numValue = value === '' ? 0 : parseInt(value);
    if (isNaN(numValue) || numValue < 0) return;

    setDraftItems((prev) => {
      const next = [...prev];
      const item = { ...next[index] };
      item.opening_balance = numValue;
      item.flag = computeFlag(item.actual_count, computeExpected(item), item.schedule);
      next[index] = item;
      addToHistory(next);
      return next;
    });
  };

  const handlePurchasedEdit = (index: number, value: string) => {
    const numValue = value === '' ? 0 : parseInt(value);
    if (isNaN(numValue) || numValue < 0) return;

    setDraftItems((prev) => {
      const next = [...prev];
      const item = { ...next[index] };
      item.purchased_count = numValue;
      item.flag = computeFlag(item.actual_count, computeExpected(item), item.schedule);
      next[index] = item;
      addToHistory(next);
      return next;
    });
  };

  const handleDispensedEdit = (index: number, value: string) => {
    const numValue = value === '' ? 0 : parseInt(value);
    if (isNaN(numValue) || numValue < 0) return;

    setDraftItems((prev) => {
      const next = [...prev];
      const item = { ...next[index] };
      item.dispensed_count = numValue;
      item.flag = computeFlag(item.actual_count, computeExpected(item), item.schedule);
      next[index] = item;
      addToHistory(next);
      return next;
    });
  };

  const handleEditClick = (index: number, field: 'opening' | 'purchased' | 'dispensed') => {
    setEditingIndex(index);
    setEditingField(field);
  };

  const handleEditBlur = () => {
    setEditingIndex(null);
    setEditingField(null);
  };

  const handleSavedActualCountBlur = async (itemId: string, value: string) => {
    const numValue = value === '' ? null : parseInt(value);
    if (numValue !== null && (isNaN(numValue) || numValue < 0)) return;
    try {
      await updateMutation.mutateAsync({ itemId, actualCount: numValue });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update';
      toast.error(message);
    }
  };

  const handleSavedOpeningBlur = async (itemId: string, value: string) => {
    const numValue = value === '' ? 0 : parseInt(value);
    if (isNaN(numValue) || numValue < 0) return;
    try {
      await openingMutation.mutateAsync({ itemId, openingBalance: numValue });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update opening count';
      toast.error(message);
    }
  };

  const handleSaveCycle = async () => {
    if (draftItems.length === 0) {
      toast.error('No items to save');
      return;
    }

    try {
      const result = await createMutation.mutateAsync({
        formData: cycleForm,
        items: draftItems,
      });
      toast.success('Reconciliation cycle saved');
      setActiveCycleId(result.cycleId);
      setView('detail');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save cycle';
      toast.error(message);
    }
  };

  const handleCompleteCycle = async () => {
    if (!activeCycleId) return;
    try {
      await completeMutation.mutateAsync({ cycleId: activeCycleId, formData: cycleForm });
      toast.success('Reconciliation cycle completed');
      setView('past');
      setActiveCycleId(null);
      setDraftItems([]);
      setMckessonFiles([]);
      setKrollFiles([]);
      setCycleForm({ start_date: '', end_date: '', performed_by: '', verified_by: '', notes: '', checklist: { ...EMPTY_CHECKLIST } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete cycle';
      toast.error(message);
    }
  };

  const handleDeleteCycle = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget);
      toast.success('Cycle deleted');
      setDeleteTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete cycle';
      toast.error(message);
    }
  };

  // =================== RENDER ===================

  if (view === 'landing') {
    return (
      <>
        <LandingView
          mckessonFiles={mckessonFiles}
          krollFiles={krollFiles}
          mckessonDragOver={mckessonDragOver}
          krollDragOver={krollDragOver}
          parsing={parsing}
          cycles={cycles ?? []}
          cyclesLoading={cyclesLoading}
          startFromPreviousMode={startFromPreviousMode}
          drugCount={drugs?.length ?? 0}
          packedDrugCount={(drugs ?? []).filter((drug) => drug.pack_size > 1).length}
          savedCountFile={savedCountFile}
          savedCountDragOver={savedCountDragOver}
          hasExistingData={existingMckessonData.size > 0 || existingKrollData.size > 0}
          onDrop={handleFileDrop}
          onDragOver={(e, zone) => {
            e.preventDefault();
            if (zone === 'mckesson') setMckessonDragOver(true);
            else setKrollDragOver(true);
          }}
          onDragLeave={(zone) => {
            if (zone === 'mckesson') setMckessonDragOver(false);
            else setKrollDragOver(false);
          }}
          onFileSelect={handleFileSelect}
          onRemoveFile={handleRemoveFile}
          onClearAllFiles={handleClearAllFiles}
          onSavedCountDrop={handleSavedCountDrop}
          onSavedCountDragOver={(e) => {
            e.preventDefault();
            setSavedCountDragOver(true);
          }}
          onSavedCountDragLeave={() => setSavedCountDragOver(false)}
          onSavedCountSelect={handleSavedCountSelect}
          onParseSavedCount={handleParseSavedCountFile}
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
    const allSelected = filteredItems.length > 0 && filteredItems.every(item => item.selected);
    const selectedCount = draftItems.filter(item => item.selected).length;

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
        onToggleBulkEdit={() => setBulkEditMode(!bulkEditMode)}
        bulkEditMode={bulkEditMode}
        onToggleSelectAll={toggleSelectAll}
        allSelected={allSelected}
        selectedCount={selectedCount}
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
        onOpenLocations={(din: string) => {
          const idx = draftItems.findIndex((i) => i.din === din);
          setLocationEditIndex(idx >= 0 ? idx : null);
        }}
        editingIndex={editingIndex}
        editingField={editingField}
        onEditClick={handleEditClick}
        onOpeningEdit={handleOpeningEdit}
        onPurchasedEdit={handlePurchasedEdit}
        onDispensedEdit={handleDispensedEdit}
        onEditBlur={handleEditBlur}
      />
      {locationEditIndex !== null && draftItems[locationEditIndex] && (
        <CountLocationsModal
          item={draftItems[locationEditIndex]}
          onClose={() => setLocationEditIndex(null)}
          onSave={(locations, total) => {
            const idx = locationEditIndex;
            setDraftItems((prev) => {
              const next = [...prev];
              const item = { ...next[idx] };
              item.locations = locations;
              item.actual_count = total;
              item.flag = computeFlag(total, computeExpected(item), item.schedule);
              next[idx] = item;
              addToHistory(next);
              return next;
            });
            setLocationEditIndex(null);
            toast.success('Location counts applied');
          }}
        />
      )}
      </>
    );
  }

  if (view === 'detail' && activeCycleId) {
    const items = activeCycleItems ?? [];
    return (
      <DetailView
        items={items}
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
          onNewCycle={() => {
            setDraftItems([]);
            setMckessonFiles([]);
            setKrollFiles([]);
            setFilePreviews({ mckesson: [], kroll: [] });
            setView('landing');
          }}
          onDeleteCycle={(id) => setDeleteTarget(id)}
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
