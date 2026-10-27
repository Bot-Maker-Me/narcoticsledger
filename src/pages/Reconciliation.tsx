import { useState, useMemo, useCallback, useRef, useEffect, type DragEvent } from 'react';
import {
  Scale,
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  History,
  Search,
  Edit3,
  Check,
  Undo,
  Redo,
  MapPin,
  FileDown,
  Download,
  X,
  Trash2,
} from 'lucide-react';
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
import { parseReconciliationFiles, mergeDinData, deduplicateDinData, parseSingleFile, parseSingleFileWithPreview, type FilePreview } from '@/lib/fileParser';
import {
  createPackSizeResolver,
  ensureDinReference,
  getDinReferenceEntry,
  getDinReferencePackSizeCount,
  getDinReferenceSize,
  isDinReferenceReady,
  referenceLabel,
} from '@/lib/dinReference';
import { supabase } from '@/lib/supabase';
import { exportToCSV, exportToPDF } from '@/lib/exportUtils';
import type {
  ReconciliationItemDraft,
  ReconciliationFlag,
  CycleFormData,
  HistoryState,
  CountLocation,
  ReconChecklist,
} from '@/types/reconciliation';
import { EMPTY_CHECKLIST, DEFAULT_COUNT_LOCATIONS } from '@/types/reconciliation';
import { motion, AnimatePresence } from 'framer-motion';
import CountLocationsModal from '@/components/CountLocationsModal';

type View = 'landing' | 'table' | 'past' | 'detail';

const flagStyles: Record<ReconciliationFlag, string> = {
  'OK': 'bg-success-50 text-success-700',
  'Pending count': 'bg-neutral-100 text-neutral-500',
  'Review': 'bg-warning-50 text-warning-700',
  'Verify': 'bg-error-50 text-error-700',
};

// History management for undo/redo
const MAX_HISTORY = 50;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

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

  // CDSA/DPD reference used to identify DINs and to turn pack quantities into units.
  const [dinReference, setDinReference] = useState<{ dinCount: number; packSizeCount: number } | null>(
    isDinReferenceReady()
      ? { dinCount: getDinReferenceSize(), packSizeCount: getDinReferencePackSizeCount() }
      : null
  );

  useEffect(() => {
    let cancelled = false;
    ensureDinReference().then(() => {
      if (!cancelled) {
        setDinReference({ dinCount: getDinReferenceSize(), packSizeCount: getDinReferencePackSizeCount() });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Auto-save draft functionality - Fixed async/await issue
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
      console.log('Parsing saved count file:', savedCountFile.name);
      
      // Parse the saved count file as CSV directly to access "Actual" column
      const text = await savedCountFile.text();
      const Papa = await import('papaparse');
      const result = Papa.parse(text, { header: true });
      
      const counts = new Map<string, number>();
      console.log('CSV rows:', result.data.length);
      console.log('CSV columns:', Object.keys(result.data[0] || {}));
      
      // Look for DIN and Actual columns with multiple possible names
      for (const row of result.data as any[]) {
        const din = row['DIN'] || row['din'] || row['Drug Identification Number'] || row['Drug ID'];
        const actualCount = row['Actual'] || row['actual'] || row['ACTUAL'] || row['actual_count'];
        
        console.log(`Row data - DIN: "${din}", Actual: "${actualCount}", Full row:`, row);
        
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
            console.log(`✓ Setting saved count for DIN "${normalizedDin}": ${count}`);
          } else {
            console.log(`✗ Invalid count for DIN "${normalizedDin}": ${actualCount}`);
          }
        } else {
          console.log(`✗ Missing DIN or Actual in row:`, row);
        }
      }

      console.log('Final saved counts map:', Array.from(counts.entries()));
      console.log('Saved counts size:', counts.size);
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
      console.log('Starting file processing for multiple files...');

      // Every imported DIN is matched against the CDSA/DPD reference.
      await ensureDinReference();
      setDinReference({ dinCount: getDinReferenceSize(), packSizeCount: getDinReferencePackSizeCount() });

      // Create SHARED deduplication sets for each file type (to catch duplicates across multiple files)
      const mckessonSignatures = new Set<string>();
      const krollSignatures = new Set<string>();

      // Process all McKesson files
      let allMckessonData = new Map<string, any>();
      let mckessonPreviews: FilePreview[] = [];

      for (const file of mckessonFiles) {
        console.log(`Processing McKesson file: ${file.name}`);
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
      let allKrollData = new Map<string, any>();
      let krollPreviews: FilePreview[] = [];

      for (const file of krollFiles) {
        console.log(`Processing Kroll file: ${file.name}`);
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
      
      console.log('All files parsed successfully', { 
        mckessonSize: allMckessonData.size, 
        krollSize: allKrollData.size,
        mckessonFiles: mckessonFiles.length,
        krollFiles: krollFiles.length 
      });
      
      // Calculate combined date range
      let combinedDateRange: { start: Date | null; end: Date | null } = { start: null, end: null };
      
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
        console.log('Deduplicating against existing data...');
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
      console.log('Preview modal should be showing now');
      
      // Store the parsed data for later use
      const merged = mergeDinData(deduplicatedMckesson, deduplicatedKroll);
      console.log('Data merged', { mergedSize: merged.size });
      
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
        console.log('Applying saved counts from file, savedCounts size:', savedCounts.size);
        console.log('Saved counts entries:', Array.from(savedCounts.entries()));
        
        // Also log the merged data DINs to see if they match
        console.log('Merged data DINs:', Array.from(merged.keys()));
        
        // Try to match DINs with different normalization
        let matchedCount = 0;
        for (const [savedDin, count] of savedCounts) {
          // Try exact match first
          if (merged.has(savedDin)) {
            console.log(`✓ Exact match found for DIN "${savedDin}": ${count}`);
            openingBalances.set(savedDin, count);
            matchedCount++;
          } else {
            // Try with leading zeros variations
            let found = false;
            for (const [mergedDin] of merged.keys()) {
              // Remove leading zeros for comparison
              const savedDinNoLeading = savedDin.replace(/^0+/, '');
              const mergedDinNoLeading = mergedDin.replace(/^0+/, '');
              
              if (savedDinNoLeading === mergedDinNoLeading) {
                console.log(`✓ Fuzzy match found for DIN "${savedDin}" -> "${mergedDin}": ${count}`);
                openingBalances.set(mergedDin, count);
                found = true;
                matchedCount++;
                break;
              }
            }
            if (!found) {
              console.log(`✗ No match found for saved DIN "${savedDin}"`);
            }
          }
        }
        console.log(`Matched ${matchedCount} out of ${savedCounts.size} saved counts`);
        console.log('Opening balances after applying saved counts:', openingBalances);
      }
      // 'zero' mode uses 0 by default

      const items: ReconciliationItemDraft[] = [];
      for (const [din, data] of merged) {
        const drug = drugMap.get(din);
        const openingBalance = openingBalances.get(din) ?? 0;

        console.log(`Creating item for DIN ${din}: openingBalance=${openingBalance}, drug=${drug?.description}`);

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
      console.log('Draft items set', { itemsLength: items.length });
      
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
    console.log('Confirm preview clicked', { draftItemsLength: draftItems.length });
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
          dinReference={dinReference}
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

// =================== LANDING VIEW ===================

interface LandingViewProps {
  mckessonFiles: File[];
  krollFiles: File[];
  mckessonDragOver: boolean;
  krollDragOver: boolean;
  parsing: boolean;
  cycles: { id: string; status: string; created_at: string }[];
  cyclesLoading: boolean;
  startFromPreviousMode: 'database' | 'file' | 'zero';
  dinReference: { dinCount: number; packSizeCount: number } | null;
  savedCountFile: File | null;
  savedCountDragOver: boolean;
  hasExistingData: boolean;
  onDrop: (e: DragEvent<HTMLDivElement>, zone: 'mckesson' | 'kroll') => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, zone: 'mckesson' | 'kroll') => void;
  onDragLeave: (zone: 'mckesson' | 'kroll') => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>, zone: 'mckesson' | 'kroll') => void;
  onRemoveFile: (index: number, zone: 'mckesson' | 'kroll') => void;
  onClearAllFiles: (zone: 'mckesson' | 'kroll') => void;
  onSavedCountDrop: (e: DragEvent<HTMLDivElement>) => void;
  onSavedCountDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onSavedCountDragLeave: () => void;
  onSavedCountSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onParseSavedCount: () => void;
  onProcess: () => void;
  onViewPast: () => void;
  onClearAll: () => void;
  onStartFromPreviousModeChange: (mode: 'database' | 'file' | 'zero') => void;
}

function LandingView(props: LandingViewProps) {
  const completedCount = props.cycles.filter((c) => c.status === 'completed').length;
  const inProgressCount = props.cycles.filter((c) => c.status === 'in_progress').length;

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Reconciliation</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Import pharmacy exports to start a reconciliation cycle
          </p>
        </div>
        <button className="btn-secondary mt-4 sm:mt-0" onClick={props.onViewPast}>
          <History className="h-4 w-4" />
          View Past Cycles
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-50">
            <CheckCircle2 className="h-5 w-5 text-success-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-neutral-900">{completedCount}</p>
          <p className="text-sm text-neutral-500">Completed Cycles</p>
        </div>
        <div className="card p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-50">
            <Scale className="h-5 w-5 text-warning-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-neutral-900">{inProgressCount}</p>
          <p className="text-sm text-neutral-500">In Progress</p>
        </div>
      </div>

      {props.hasExistingData && (
        <div className="mb-6 card p-4 bg-primary-50 border-primary-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-primary-600" />
              <div>
                <p className="text-sm font-medium text-primary-900">Existing data detected</p>
                <p className="text-xs text-primary-700">New uploads will be deduplicated against existing data to prevent duplicates.</p>
              </div>
            </div>
            <button
              onClick={props.onClearAll}
              className="text-sm text-primary-700 hover:text-primary-900 font-medium"
            >
              Clear all data
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 card p-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
          <div>
            <p className="text-sm font-medium text-neutral-800">
              {props.dinReference === null
                ? 'Loading DIN reference…'
                : props.dinReference.dinCount > 0
                  ? `${props.dinReference.dinCount} DINs in the CDSA/DPD reference`
                  : 'CDSA/DPD reference unavailable'}
            </p>
            <p className="text-xs text-neutral-500">
              {props.dinReference === null
                ? 'DINs are matched and quantities converted to total units once the reference is ready.'
                : props.dinReference.packSizeCount > 0
                  ? "Every DIN from uploaded files and manual entries is matched to this reference for the product name, CDSA schedule and pack size (unmatched DINs are retried with a leading zero), then multiplied by that pack size to record total units."
                  : props.dinReference.dinCount > 0
                    ? "Every DIN from uploaded files and manual entries is matched to this reference for the product name and CDSA schedule (unmatched DINs are retried with a leading zero). Quantities are multiplied by each drug's Pack Size to record total units."
                    : "Quantities are multiplied by each drug's Pack Size to record total units."}
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 card p-6">
        <h3 className="mb-4 text-lg font-semibold text-neutral-900">Starting Count Option</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="startOption"
              checked={props.startFromPreviousMode === 'zero'}
              onChange={() => props.onStartFromPreviousModeChange('zero')}
              className="h-4 w-4 text-primary-600"
            />
            <span className="text-sm text-neutral-700">Start from zero</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="startOption"
              checked={props.startFromPreviousMode === 'database'}
              onChange={() => props.onStartFromPreviousModeChange('database')}
              className="h-4 w-4 text-primary-600"
            />
            <span className="text-sm text-neutral-700">Start from previous saved counts (from database)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="startOption"
              checked={props.startFromPreviousMode === 'file'}
              onChange={() => props.onStartFromPreviousModeChange('file')}
              className="h-4 w-4 text-primary-600"
            />
            <span className="text-sm text-neutral-700">Start from saved counts file</span>
          </label>
        </div>

        {props.startFromPreviousMode === 'file' && (
          <div className="mt-4">
            <DropZone
              label="Saved Count File"
              description="Upload a file with DIN and actual count columns (.csv, .xlsx, .xls)"
              icon={FileSpreadsheet}
              file={props.savedCountFile}
              dragOver={props.savedCountDragOver}
              accept=".csv,.xlsx,.xls"
              onDrop={props.onSavedCountDrop}
              onDragOver={props.onSavedCountDragOver}
              onDragLeave={props.onSavedCountDragLeave}
              onFileSelect={props.onSavedCountSelect}
              onClear={() => {}}
            />
            {/* Parse automatically when file is selected - no manual button needed */}
          </div>
        )}
      </div>

      <div className="mb-6 card p-6">
        <h3 className="mb-4 text-lg font-semibold text-neutral-900">File Uploads</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <MultiFileDropZone
            label="McKesson Exports"
            description="Upload one or more McKesson purchase reports (.csv, .xlsx, .xls)"
            icon={FileSpreadsheet}
            files={props.mckessonFiles}
            dragOver={props.mckessonDragOver}
            accept=".csv,.xlsx,.xls"
            onDrop={(e) => props.onDrop(e, 'mckesson')}
            onDragOver={(e) => props.onDragOver(e, 'mckesson')}
            onDragLeave={() => props.onDragLeave('mckesson')}
            onFileSelect={(e) => props.onFileSelect(e, 'mckesson')}
            onRemoveFile={(index) => props.onRemoveFile(index, 'mckesson')}
            onClearAll={() => props.onClearAllFiles('mckesson')}
          />
          <MultiFileDropZone
            label="Kroll Exports"
            description="Upload one or more Kroll dispensing reports (.csv, .xlsx, .xls)"
            icon={FileText}
            files={props.krollFiles}
            dragOver={props.krollDragOver}
            accept=".csv,.xlsx,.xls"
            onDrop={(e) => props.onDrop(e, 'kroll')}
            onDragOver={(e) => props.onDragOver(e, 'kroll')}
            onDragLeave={() => props.onDragLeave('kroll')}
            onFileSelect={(e) => props.onFileSelect(e, 'kroll')}
            onRemoveFile={(index) => props.onRemoveFile(index, 'kroll')}
            onClearAll={() => props.onClearAllFiles('kroll')}
          />
        </div>
      </div>

      <div className="mt-6 flex justify-center">
        <button
          className="btn-primary"
          onClick={props.onProcess}
          disabled={props.mckessonFiles.length === 0 || props.krollFiles.length === 0 || props.parsing}
        >
          {props.parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {props.parsing ? 'Processing...' : 'Process Files'}
        </button>
      </div>

      {(props.mckessonFiles.length === 0 || props.krollFiles.length === 0) && (
        <p className="mt-3 text-center text-xs text-neutral-400">
          Upload at least one McKesson and one Kroll file to start reconciliation
        </p>
      )}
    </div>
  );
}

// =================== DROP ZONE ===================

interface DropZoneProps {
  label: string;
  description: string;
  icon: typeof FileSpreadsheet;
  file: File | null;
  dragOver: boolean;
  accept: string;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}

function DropZone(props: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = props.icon;

  return (
    <div
      onDrop={props.onDrop}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onClick={() => inputRef.current?.click()}
      className={`card relative flex cursor-pointer flex-col items-center justify-center p-8 transition-all duration-200 ${
        props.dragOver
          ? 'border-2 border-primary-400 bg-primary-50/30 scale-[1.02]'
          : 'border-2 border-dashed border-neutral-200 hover:border-primary-300 hover:bg-primary-50/20'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={props.accept}
        className="hidden"
        onChange={props.onFileSelect}
      />

      {props.file ? (
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-50">
              <CheckCircle2 className="h-5 w-5 text-success-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-800">{props.file.name}</p>
              <p className="text-xs text-neutral-400">{(props.file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              props.onClear();
            }}
            className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-xl transition-colors ${
              props.dragOver ? 'bg-primary-100' : 'bg-neutral-100'
            }`}
          >
            <Icon className={`h-7 w-7 ${props.dragOver ? 'text-primary-600' : 'text-neutral-400'}`} />
          </div>
          <p className="mt-4 text-sm font-semibold text-neutral-700">{props.label}</p>
          <p className="mt-1 text-xs text-neutral-400">{props.description}</p>
          <p className="mt-2 text-xs text-neutral-300">Drag & drop or click to browse</p>
        </>
      )}
    </div>
  );
}

function MultiFileDropZone({
  label,
  description,
  icon: Icon,
  files,
  dragOver,
  accept,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileSelect,
  onRemoveFile,
  onClearAll,
}: {
  label: string;
  description: string;
  icon: any;
  files: File[];
  dragOver: boolean;
  accept: string;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
  onClearAll: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
      className={`card relative flex cursor-pointer flex-col p-6 transition-all duration-200 ${
        dragOver
          ? 'border-2 border-primary-400 bg-primary-50/30 scale-[1.02]'
          : 'border-2 border-dashed border-neutral-200 hover:border-primary-300 hover:bg-primary-50/20'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={onFileSelect}
      />

      <div className="flex flex-col">
        <div className="flex flex-col items-center text-center mb-4">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-xl transition-colors ${
              dragOver ? 'bg-primary-100' : 'bg-neutral-100'
            }`}
          >
            <Icon className={`h-7 w-7 ${dragOver ? 'text-primary-600' : 'text-neutral-400'}`} />
          </div>
          <p className="mt-4 text-sm font-semibold text-neutral-700">{label}</p>
          <p className="mt-1 text-xs text-neutral-400">{description}</p>
          <p className="mt-2 text-xs text-neutral-300">Drag & drop or click to browse (multiple files allowed)</p>
        </div>
        
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-700">{files.length} file(s) uploaded</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClearAll();
                }}
                className="text-xs text-error-600 hover:text-error-700"
              >
                Clear all
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between bg-neutral-50 rounded px-2 py-1"
                >
                  <span className="text-xs text-neutral-600 truncate flex-1">{file.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFile(index);
                    }}
                    className="text-neutral-400 hover:text-error-600 ml-2"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =================== TABLE VIEW (draft) ===================

interface TableViewProps {
  items: ReconciliationItemDraft[];
  filteredItems: ReconciliationItemDraft[];
  cycleForm: CycleFormData;
  onFormChange: (form: CycleFormData) => void;
  onActualCountChange: (index: number, value: string) => void;
  onNoteChange: (index: number, value: string) => void;
  onSave: () => void;
  onBack: () => void;
  saving: boolean;
  onSearchChange: (query: string) => void;
  onToggleBulkEdit: () => void;
  bulkEditMode: boolean;
  onToggleSelectAll: () => void;
  allSelected: boolean;
  selectedCount: number;
  onToggleItemSelection: (index: number) => void;
  onBulkEdit: (value: number | null) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onVerifyItem: (index: number) => void;
  verifyModalOpen: boolean;
  onCloseVerifyModal: () => void;
  verifyNote: string;
  onVerifyNoteChange: (note: string) => void;
  onSaveVerifyNote: () => void;
  searchQuery: string;
  onOpenLocations: (din: string) => void;
  editingIndex: number | null;
  editingField: 'opening' | 'purchased' | 'dispensed' | null;
  onEditClick: (index: number, field: 'opening' | 'purchased' | 'dispensed') => void;
  onOpeningEdit: (index: number, value: string) => void;
  onPurchasedEdit: (index: number, value: string) => void;
  onDispensedEdit: (index: number, value: string) => void;
  onEditBlur: () => void;
}

function TableView(props: TableViewProps) {
  const stats = useMemo(() => {
    let pending = 0, ok = 0, review = 0, verify = 0;
    for (const item of props.items) {
      if (item.flag === 'Pending count') pending++;
      else if (item.flag === 'OK') ok++;
      else if (item.flag === 'Review') review++;
      else if (item.flag === 'Verify') verify++;
    }
    return { pending, ok, review, verify };
  }, [props.items]);

  const progress = useMemo(() => {
    if (props.items.length === 0) return 0;
    const counted = props.items.filter(item => item.actual_count !== null).length;
    return Math.round((counted / props.items.length) * 100);
  }, [props.items]);

  // Rows can be filtered by the search box, so map each DIN back to its
  // position in the full item list to keep edits pointed at the right row.
  const indexByDin = useMemo(() => {
    const map = new Map<string, number>();
    props.items.forEach((item, i) => map.set(item.din, i));
    return map;
  }, [props.items]);

  const handleExportCSV = () => {
    exportToCSV(props.items);
    toast.success('CSV exported successfully');
  };

  const handleExportPDF = () => {
    exportToPDF(props.items);
    toast.success('PDF exported successfully');
  };

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Reconciliation Table</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {props.items.length} items · {progress}% counted
          </p>
        </div>
        <div className="mt-4 flex items-center gap-2 sm:mt-0">
          <button className="btn-secondary" onClick={props.onBack}>
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <button className="btn-secondary" onClick={handleExportCSV}>
            <FileDown className="h-4 w-4" />
            Export CSV
          </button>
          <button className="btn-secondary" onClick={handleExportPDF}>
            <Download className="h-4 w-4" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4 card p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-neutral-700">Counting Progress</span>
          <span className="text-sm font-semibold text-primary-600">{progress}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
            className="h-full bg-primary-500"
          />
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by DIN or description..."
            className="input-field pl-10"
            onChange={(e) => props.onSearchChange(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary"
            onClick={props.onToggleBulkEdit}
            style={{
              backgroundColor: props.bulkEditMode ? '#f0fdfa' : undefined,
              borderColor: props.bulkEditMode ? '#14b8a6' : undefined,
            }}
          >
            <Edit3 className="h-4 w-4" />
            {props.bulkEditMode ? 'Exit Bulk Edit' : 'Bulk Edit'}
          </button>
          <button className="btn-secondary" onClick={props.onUndo} disabled={!props.canUndo} title="Undo">
            <Undo className="h-4 w-4" />
          </button>
          <button className="btn-secondary" onClick={props.onRedo} disabled={!props.canRedo} title="Redo">
            <Redo className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Bulk Edit Toolbar */}
      <AnimatePresence>
        {props.bulkEditMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 card p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <button className="btn-secondary text-xs" onClick={props.onToggleSelectAll}>
                  {props.allSelected ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-sm text-neutral-500">
                  {props.selectedCount} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Set count"
                  className="input-field w-32"
                  onChange={(e) => props.onBulkEdit(e.target.value ? parseInt(e.target.value) : null)}
                />
                <button
                  className="btn-primary text-xs"
                  onClick={() => props.onBulkEdit(null)}
                  disabled={props.selectedCount === 0}
                >
                  Apply
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-4 flex flex-wrap gap-3">
        <FlagBadge label="Pending" count={stats.pending} style="bg-neutral-100 text-neutral-600" />
        <FlagBadge label="OK" count={stats.ok} style="bg-success-50 text-success-700" />
        <FlagBadge label="Review" count={stats.review} style="bg-warning-50 text-warning-700" />
        <FlagBadge label="Verify" count={stats.verify} style="bg-error-50 text-error-700" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/50">
                {props.bulkEditMode && (
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 w-10">
                    <input
                      type="checkbox"
                      checked={props.allSelected}
                      onChange={props.onToggleSelectAll}
                      className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                )}
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">DIN</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Description</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Opening</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Purchased</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Dispensed</th>
                <th
                  className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-primary-600"
                  title="Total units for this DIN in this period (Opening + Purchased − Dispensed)"
                >
                  Total
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Expected</th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">Actual</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Variance</th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">Flag</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Notes</th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 w-10">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {props.filteredItems.map((item, index) => {
                const itemIndex = indexByDin.get(item.din) ?? index;
                const total = item.opening_balance + item.purchased_count - item.dispensed_count;
                const expected = total;
                const variance = item.actual_count !== null ? item.actual_count - expected : null;
                const hasVariance = variance !== null && variance !== 0;
                const isHighlighted = props.searchQuery && (
                  item.din.toLowerCase().includes(props.searchQuery.toLowerCase()) ||
                  item.description.toLowerCase().includes(props.searchQuery.toLowerCase())
                );
                
                return (
                  <tr 
                    key={item.din} 
                    className={`transition-colors hover:bg-neutral-50/50 ${
                      hasVariance ? 'bg-warning-50/30' : ''
                    } ${
                      isHighlighted ? 'bg-primary-50/50' : ''
                    }`}
                  >
                    {props.bulkEditMode && (
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={item.selected || false}
                          onChange={() => props.onToggleItemSelection(itemIndex)}
                          className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs font-medium text-neutral-700">{item.din}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-sm text-neutral-700">{item.description}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm text-neutral-600">
                      {props.editingIndex === itemIndex && props.editingField === 'opening' ? (
                        <input
                          type="number"
                          autoFocus
                          defaultValue={item.opening_balance}
                          onChange={(e) => props.onOpeningEdit(itemIndex, e.target.value)}
                          onBlur={props.onEditBlur}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          className="w-20 rounded border border-primary-400 px-2 py-1 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                          min="0"
                        />
                      ) : (
                        <span
                          onClick={() => props.onEditClick(itemIndex, 'opening')}
                          className="cursor-pointer hover:bg-primary-50 hover:text-primary-600 rounded px-2 py-1 transition-colors"
                          title="Click to edit opening count"
                        >
                          {item.opening_balance}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm text-success-600">
                      {props.editingIndex === itemIndex && props.editingField === 'purchased' ? (
                        <input
                          type="number"
                          autoFocus
                          defaultValue={item.purchased_count}
                          onChange={(e) => props.onPurchasedEdit(itemIndex, e.target.value)}
                          onBlur={props.onEditBlur}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          className="w-20 rounded border border-primary-400 px-2 py-1 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                          min="0"
                        />
                      ) : (
                        <span
                          onClick={() => props.onEditClick(itemIndex, 'purchased')}
                          className="cursor-pointer hover:bg-primary-50 hover:text-primary-600 rounded px-2 py-1 transition-colors"
                          title="Click to edit"
                        >
                          +{item.purchased_count}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm text-error-600">
                      {props.editingIndex === itemIndex && props.editingField === 'dispensed' ? (
                        <input
                          type="number"
                          autoFocus
                          defaultValue={item.dispensed_count}
                          onChange={(e) => props.onDispensedEdit(itemIndex, e.target.value)}
                          onBlur={props.onEditBlur}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          className="w-20 rounded border border-primary-400 px-2 py-1 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                          min="0"
                        />
                      ) : (
                        <span
                          onClick={() => props.onEditClick(itemIndex, 'dispensed')}
                          className="cursor-pointer hover:bg-primary-50 hover:text-primary-600 rounded px-2 py-1 transition-colors"
                          title="Click to edit"
                        >
                          -{item.dispensed_count}
                        </span>
                      )}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right text-sm font-semibold text-primary-700 bg-primary-50/40"
                      title="Total units for this DIN (Opening + Purchased − Dispensed)"
                    >
                      {total}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm font-semibold text-neutral-700">{expected}</td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        min={0}
                        value={item.actual_count ?? ''}
                        onChange={(e) => props.onActualCountChange(itemIndex, e.target.value)}
                        placeholder="—"
                        className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-center text-sm text-neutral-800 placeholder:text-neutral-300 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {variance === null ? (
                        <span className="text-sm text-neutral-300">—</span>
                      ) : (
                        <span className={`text-sm font-semibold ${variance === 0 ? 'text-success-600' : variance < 0 ? 'text-error-600' : 'text-warning-600'}`}>
                          {variance > 0 ? '+' : ''}{variance}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${flagStyles[item.flag]}`}>
                        {item.flag}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={item.note || ''}
                        onChange={(e) => props.onNoteChange(itemIndex, e.target.value)}
                        placeholder="Add note..."
                        className="w-full rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-800 placeholder:text-neutral-300 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => props.onVerifyItem(itemIndex)}
                        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                        title="Add verification note"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt-6 p-6">
        <h3 className="text-sm font-semibold text-neutral-800">Cycle Details</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-600">Start Date</label>
            <input
              type="date"
              value={props.cycleForm.start_date}
              onChange={(e) => props.onFormChange({ ...props.cycleForm, start_date: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-600">End Date</label>
            <input
              type="date"
              value={props.cycleForm.end_date}
              onChange={(e) => props.onFormChange({ ...props.cycleForm, end_date: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-600">Performed By</label>
            <input
              type="text"
              value={props.cycleForm.performed_by}
              onChange={(e) => props.onFormChange({ ...props.cycleForm, performed_by: e.target.value })}
              placeholder="e.g. Jane Smith"
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-600">Verified By</label>
            <input
              type="text"
              value={props.cycleForm.verified_by}
              onChange={(e) => props.onFormChange({ ...props.cycleForm, verified_by: e.target.value })}
              placeholder="e.g. Dr. John Doe"
              className="input-field"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-neutral-600">Notes</label>
            <textarea
              value={props.cycleForm.notes}
              onChange={(e) => props.onFormChange({ ...props.cycleForm, notes: e.target.value })}
              placeholder="Optional notes about this cycle..."
              className="input-field min-h-[60px] resize-y"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button className="btn-primary" onClick={props.onSave} disabled={props.saving}>
            {props.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {props.saving ? 'Saving...' : 'Save Cycle'}
          </button>
        </div>
      </div>

      {/* Verify Modal */}
      <AnimatePresence>
        {props.verifyModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
              onClick={props.onCloseVerifyModal}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md"
            >
              <div className="card p-6">
                <h3 className="text-lg font-semibold text-neutral-900">Add Verification Note</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Explain why this item needs verification
                </p>
                <textarea
                  value={props.verifyNote}
                  onChange={(e) => props.onVerifyNoteChange(e.target.value)}
                  placeholder="Enter verification reason..."
                  className="input-field mt-4 min-h-[100px] resize-y"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button className="btn-secondary" onClick={props.onCloseVerifyModal}>
                    Cancel
                  </button>
                  <button className="btn-primary" onClick={props.onSaveVerifyNote}>
                    <Check className="h-4 w-4" />
                    Save Note
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =================== DETAIL VIEW (saved cycle) ===================

interface SavedItem {
  id: string;
  din: string;
  description: string | null;
  schedule: string | null;
  opening_balance: number;
  purchased_count: number;
  dispensed_count: number;
  actual_count: number | null;
  flag: string;
}

interface DetailViewProps {
  items: SavedItem[];
  onActualCountBlur: (itemId: string, value: string) => void;
  onOpeningBlur: (itemId: string, value: string) => void;
  onComplete: () => void;
  onBack: () => void;
  completing: boolean;
  updating: boolean;
}

function DetailView(props: DetailViewProps) {
  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Reconciliation Detail</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {props.items.length} items · Enter actual counts, then complete the cycle
          </p>
        </div>
        <div className="flex gap-2 mt-4 sm:mt-0">
          <button className="btn-secondary" onClick={props.onBack}>
            <ChevronLeft className="h-4 w-4" />
            Back to Cycles
          </button>
          <button className="btn-primary" onClick={props.onComplete} disabled={props.completing}>
            {props.completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {props.completing ? 'Completing...' : 'Complete Cycle'}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/50">
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">DIN</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Description</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Opening</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Purchased</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Dispensed</th>
                <th
                  className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-primary-600"
                  title="Total units for this DIN (Opening + Purchased − Dispensed)"
                >
                  Total
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Expected</th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">Actual</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Variance</th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">Flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {props.items.map((item) => {
                const expected = item.opening_balance + item.purchased_count - item.dispensed_count;
                const variance = item.actual_count !== null ? item.actual_count - expected : null;
                return (
                  <tr key={item.id} className="transition-colors hover:bg-neutral-50/50">
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs font-medium text-neutral-700">{item.din}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-sm text-neutral-700">{item.description ?? 'Unknown'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        min={0}
                        defaultValue={item.opening_balance}
                        onBlur={(e) => props.onOpeningBlur(item.id, e.target.value)}
                        title="Opening count — editable"
                        className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-center text-sm text-neutral-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm text-success-600">+{item.purchased_count}</td>
                    <td className="px-3 py-2.5 text-right text-sm text-error-600">-{item.dispensed_count}</td>
                    <td
                      className="px-3 py-2.5 text-right text-sm font-semibold text-primary-700 bg-primary-50/40"
                      title="Total units for this DIN (Opening + Purchased − Dispensed)"
                    >
                      {expected}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm font-semibold text-neutral-700">{expected}</td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        min={0}
                        defaultValue={item.actual_count ?? ''}
                        onBlur={(e) => props.onActualCountBlur(item.id, e.target.value)}
                        placeholder="—"
                        className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-center text-sm text-neutral-800 placeholder:text-neutral-300 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {variance === null ? (
                        <span className="text-sm text-neutral-300">—</span>
                      ) : (
                        <span className={`text-sm font-semibold ${variance === 0 ? 'text-success-600' : variance < 0 ? 'text-error-600' : 'text-warning-600'}`}>
                          {variance > 0 ? '+' : ''}{variance}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${flagStyles[item.flag as ReconciliationFlag] ?? 'bg-neutral-100 text-neutral-500'}`}>
                        {item.flag}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =================== PAST CYCLES VIEW ===================

interface PastCyclesViewProps {
  cycles: {
    id: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    performed_by: string | null;
    verified_by: string | null;
    notes: string | null;
    created_at: string;
    name: string | null;
  }[];
  loading: boolean;
  onViewCycle: (id: string) => void;
  onNewCycle: () => void;
  onDeleteCycle: (id: string) => void;
}

function PastCyclesView(props: PastCyclesViewProps) {
  const draftCycles = props.cycles.filter(c => c.status === 'draft');
  const otherCycles = props.cycles.filter(c => c.status !== 'draft');

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Reconciliation Cycles</h1>
          <p className="mt-1 text-sm text-neutral-500">View and manage reconciliation history</p>
        </div>
        <button className="btn-primary mt-4 sm:mt-0" onClick={props.onNewCycle}>
          <Scale className="h-4 w-4" />
          New Reconciliation
        </button>
      </div>

      {props.loading ? (
        <div className="card p-12 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-neutral-300" />
          <p className="mt-3 text-sm text-neutral-400">Loading cycles...</p>
        </div>
      ) : props.cycles.length === 0 ? (
        <div className="card p-12 text-center">
          <Scale className="mx-auto h-10 w-10 text-neutral-300" />
          <p className="mt-3 text-sm text-neutral-400">No reconciliation cycles yet</p>
          <button className="btn-primary mt-4" onClick={props.onNewCycle}>
            <Scale className="h-4 w-4" />
            Start your first cycle
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pending Drafts Section */}
          {draftCycles.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-neutral-800">
                Pending Drafts ({draftCycles.length})
              </h2>
              <div className="space-y-3">
                {draftCycles.map((cycle) => (
                  <div key={cycle.id} className="card p-5 border-l-4 border-warning-400 transition-all duration-200 hover:shadow-elevated">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-warning-50">
                          <Edit3 className="h-5 w-5 text-warning-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-neutral-900">
                              {cycle.name || `Draft - ${formatDate(cycle.created_at)}`}
                            </p>
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-warning-50 text-warning-700">
                              Draft
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-neutral-400">
                            Created {formatDate(cycle.created_at)} · Continue working on this reconciliation
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button 
                          className="btn-primary text-xs" 
                          onClick={() => props.onViewCycle(cycle.id)}
                        >
                          Continue
                        </button>
                        <button
                          className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-error-50 hover:text-error-600"
                          onClick={() => props.onDeleteCycle(cycle.id)}
                          title="Delete draft"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completed and In-Progress Cycles */}
          {otherCycles.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-neutral-800">
                {draftCycles.length > 0 ? 'Completed Cycles' : 'All Cycles'}
              </h2>
              <div className="space-y-3">
                {otherCycles.map((cycle) => {
                  const isCompleted = cycle.status === 'completed';
                  return (
                    <div key={cycle.id} className="card p-5 transition-all duration-200 hover:shadow-elevated">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${isCompleted ? 'bg-success-50' : 'bg-warning-50'}`}>
                            {isCompleted ? (
                              <CheckCircle2 className="h-5 w-5 text-success-600" />
                            ) : (
                              <Scale className="h-5 w-5 text-warning-600" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-neutral-900">
                                {cycle.start_date ? formatDate(cycle.start_date) : formatDate(cycle.created_at)}
                                {cycle.end_date ? ` — ${formatDate(cycle.end_date)}` : ''}
                              </p>
                              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${isCompleted ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'}`}>
                                {isCompleted ? 'Completed' : 'In Progress'}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-neutral-400">
                              {cycle.performed_by && `Performed by ${cycle.performed_by}`}
                              {cycle.performed_by && cycle.verified_by && ' · '}
                              {cycle.verified_by && `Verified by ${cycle.verified_by}`}
                              {!cycle.performed_by && !cycle.verified_by && 'No performer/verifier assigned'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button className="btn-secondary text-xs" onClick={() => props.onViewCycle(cycle.id)}>
                            {isCompleted ? 'View' : 'Continue'}
                          </button>
                          <button
                            className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-error-50 hover:text-error-600"
                            onClick={() => props.onDeleteCycle(cycle.id)}
                            title="Delete cycle"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {cycle.notes && (
                        <p className="mt-3 text-xs text-neutral-400">{cycle.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =================== DELETE DIALOG ===================

function DeleteDialog({
  onCancel,
  onConfirm,
  deleting,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-sm animate-slide-up">
        <div className="card p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-error-50">
            <Trash2 className="h-6 w-6 text-error-500" />
          </div>
          <h3 className="text-lg font-semibold text-neutral-900">Delete cycle?</h3>
          <p className="mt-1 text-sm text-neutral-500">
            This will permanently delete the reconciliation cycle and all its items. This cannot be undone.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={deleting}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-error-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-error-700 active:scale-[0.98] disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =================== HELPERS ===================

function FlagBadge({ label, count, style }: { label: string; count: number; style: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${style}`}>
      {label}: {count}
    </span>
  );
}

// =================== FILE PREVIEW MODAL ===================

interface FilePreviewModalProps {
  previews: {
    mckesson: FilePreview[];
    kroll: FilePreview[];
  };
  itemCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function FilePreviewModal({ previews, itemCount, onConfirm, onCancel }: FilePreviewModalProps) {
  if (previews.mckesson.length === 0 && previews.kroll.length === 0) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-4xl animate-slide-up z-[10000] max-h-[90vh] overflow-y-auto">
        <div className="card p-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-neutral-900">File Import Preview</h2>
            <p className="mt-1 text-sm text-neutral-500">
              Review the parsed data before proceeding. {itemCount} unique DIN{itemCount === 1 ? '' : 's'} ready for this cycle from {previews.mckesson.length} McKesson and {previews.kroll.length} Kroll file(s).
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* McKesson Files */}
            <div className="space-y-3">
              <h3 className="font-semibold text-neutral-800">McKesson Files ({previews.mckesson.length})</h3>
              {previews.mckesson.map((preview, index) => (
                <div key={index} className="rounded-lg border border-neutral-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-neutral-800">{preview.fileName}</span>
                    <span className="text-xs font-medium uppercase text-neutral-500">{preview.format}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-neutral-500">Rows:</span>
                      <span className="ml-1 font-medium text-neutral-800">{preview.totalRows}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">DINs:</span>
                      <span className="ml-1 font-medium text-primary-600">{preview.uniqueDINs}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Size:</span>
                      <span className="ml-1 font-medium text-neutral-800">{(preview.fileSize / 1024).toFixed(1)} KB</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Kroll Files */}
            <div className="space-y-3">
              <h3 className="font-semibold text-neutral-800">Kroll Files ({previews.kroll.length})</h3>
              {previews.kroll.map((preview, index) => (
                <div key={index} className="rounded-lg border border-neutral-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-neutral-800">{preview.fileName}</span>
                    <span className="text-xs font-medium uppercase text-neutral-500">{preview.format}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-neutral-500">Rows:</span>
                      <span className="ml-1 font-medium text-neutral-800">{preview.totalRows}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">DINs:</span>
                      <span className="ml-1 font-medium text-primary-600">{preview.uniqueDINs}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Size:</span>
                      <span className="ml-1 font-medium text-neutral-800">{(preview.fileSize / 1024).toFixed(1)} KB</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
            <button 
              onClick={onConfirm}
              className="btn-primary"
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirm & Start Reconciliation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
