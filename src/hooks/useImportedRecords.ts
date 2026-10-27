import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getDinReferenceEntry, referenceLabel } from '@/lib/dinReference';
import { toLedgerDateString } from '@/lib/ledgerDate';
import type { ParsedDinData } from '@/types/reconciliation';
import type { TransactionType } from '@/types/transaction';

export type ImportKind = 'purchase' | 'dispense' | 'destruction';

export interface ImportedRecordRow {
  id: string;
  din: string;
  description: string;
  quantity: number;
  type: TransactionType;
  source: string;
  created_at: string;
  file_name?: string;
}

export interface SaveResult {
  saved: number;
  skipped: number;
  errors: string[];
}

const KIND_CONFIG: Record<
  ImportKind,
  { type: TransactionType; source: string; notesPrefix: string }
> = {
  purchase: { type: 'PURCHASE', source: 'purchase_import', notesPrefix: 'Purchase import' },
  dispense: { type: 'DISPENSE', source: 'dispense_import', notesPrefix: 'Dispense import' },
  destruction: { type: 'ADJUSTMENT', source: 'destruction_import', notesPrefix: 'Destruction import' },
};

function quantityForKind(kind: ImportKind, record: ParsedDinData): number {
  if (kind === 'purchase') return Math.abs(record.purchased) || 0;
  if (kind === 'dispense') return Math.abs(record.dispensed) || 0;
  return Math.abs(record.dispensed || record.purchased || 0);
}

async function ensureDrugId(din: string, description?: string): Promise<string> {
  // Normalize DIN - remove any non-digit characters and preserve original length
  const normalizedDin = din.toString().replace(/\D/g, '');
  
  // Validate DIN is between 6-10 digits
  if (!/^\d{6,10}$/.test(normalizedDin)) {
    console.warn(`Invalid DIN format: ${din} -> ${normalizedDin}`);
    throw new Error(`Invalid DIN format: ${din}. DIN must be 6-10 digits.`);
  }

  const { data: existing, error: lookupError } = await supabase
    .from('drugs')
    .select('id')
    .eq('din', normalizedDin)
    .limit(1);

  if (lookupError) {
    console.error('Error looking up drug:', lookupError);
    throw new Error(`Failed to lookup drug ${normalizedDin}: ${lookupError.message}`);
  }
  
  if (existing?.[0]?.id) return existing[0].id;

  // Fall back to the CDSA/DPD reference for the product name and CDSA schedule.
  const reference = getDinReferenceEntry(normalizedDin);

  const { data: created, error: createError } = await supabase
    .from('drugs')
    .insert({
      din: normalizedDin,
      description: description?.trim() || (reference ? referenceLabel(reference) : '') || `Imported DIN ${normalizedDin}`,
      schedule: reference?.schedule ?? 'Verify',
    })
    .select('id')
    .single();

  if (createError) {
    // Handle duplicate key error - drug might have been created by another request
    if (createError.code === '23505' || createError.message.includes('duplicate key')) {
      console.log(`Drug ${normalizedDin} already exists (race condition), re-querying...`);
      const { data: retryExisting, error: retryError } = await supabase
        .from('drugs')
        .select('id')
        .eq('din', normalizedDin)
        .limit(1);
      
      if (retryError) {
        console.error('Error re-querying drug after duplicate:', retryError);
        throw new Error(`Failed to lookup drug ${normalizedDin} after duplicate: ${retryError.message}`);
      }
      
      if (retryExisting?.[0]?.id) {
        return retryExisting[0].id;
      }
      
      throw new Error(`Drug ${normalizedDin} appears to exist but could not be found after duplicate error`);
    }
    
    console.error('Error creating drug:', createError);
    throw new Error(`Failed to create drug ${normalizedDin}: ${createError.message}`);
  }
  
  return created.id;
}

/** The API returns at most this many rows per request, so the ledger is paged through. */
const FETCH_PAGE_SIZE = 1000;

async function fetchImportedRecords(kind: ImportKind): Promise<ImportedRecordRow[]> {
  const config = KIND_CONFIG[kind];

  // Filter by transaction_type instead of source for reliability.
  // A single request only returns the first page, which silently dropped older
  // records and made the monthly totals short, so keep paging to the end.
  const rows: any[] = [];

  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('inventory_transactions')
      .select('id, transaction_type, quantity, created_at, date, file_name, drugs!inner(din, description)')
      .eq('transaction_type', config.type)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1);

    if (error) {
      console.error('Error fetching imported records:', error);
      throw error;
    }

    rows.push(...(data ?? []));
    if (!data || data.length < FETCH_PAGE_SIZE) break;
  }

  console.log(`Fetched ${rows.length} records for kind ${kind}`);

  return rows.map((row) => {
    const drug = row.drugs as unknown as { din: string; description: string };
    return {
      id: row.id,
      din: drug?.din ?? '--------',
      description: drug?.description ?? 'Unknown',
      quantity: Math.abs(Number(row.quantity ?? 0)),
      type: ((row as any).transaction_type || KIND_CONFIG[kind].type) as TransactionType,
      source: (row as any).source || KIND_CONFIG[kind].source,
      created_at: (row as any).date || row.created_at || new Date().toISOString(),
      file_name: (row as any).file_name,
    };
  });
}

async function saveImportedRecords({
  kind,
  records,
  fileName,
}: {
  kind: ImportKind;
  records: ParsedDinData[];
  fileName?: string;
}): Promise<SaveResult> {
  const config = KIND_CONFIG[kind];
  let saved = 0;
  let skipped = 0;
  const errors: string[] = [];

  console.log(`Starting to save ${records.length} ${kind} records...`);

  // Filter out invalid records first
  const validRecords = records.filter(record => {
    const qty = quantityForKind(kind, record);
    return record.din && qty > 0;
  });

  console.log(`Filtered to ${validRecords.length} valid records out of ${records.length} total`);
  skipped = records.length - validRecords.length;

  if (validRecords.length === 0) {
    console.log('No valid records to save');
    return { saved: 0, skipped, errors };
  }

  // Batch process: First ensure all drug IDs exist
  const drugIdMap = new Map<string, string>();
  const uniqueDins = [...new Set(validRecords.map(r => r.din))];
  
  console.log(`Ensuring ${uniqueDins.length} unique drug IDs exist...`);
  
  for (const din of uniqueDins) {
    try {
      const record = validRecords.find(r => r.din === din);
      const drugId = await ensureDrugId(din, record?.description);
      drugIdMap.set(din, drugId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error ensuring drug ID for DIN ${din}:`, errorMessage);
      errors.push(`DIN ${din}: ${errorMessage}`);
      // Remove records with this DIN from valid records
      const index = validRecords.findIndex(r => r.din === din);
      if (index !== -1) {
        validRecords.splice(index, 1);
        skipped += 1;
      }
    }
  }

  console.log(`Drug IDs ensured. Preparing ${validRecords.length} transactions for batch insert...`);

  // Prepare all transactions for batch insert
  const transactions = validRecords.map(record => {
    const qty = quantityForKind(kind, record);
    const drugId = drugIdMap.get(record.din);
    const signedQty = config.type === 'PURCHASE' ? qty : -qty;

    // Use the date from the transaction data if available, otherwise use today.
    // Stored as a plain calendar day so the purchase date never drifts by timezone.
    let transactionDate = toLedgerDateString(new Date());
    if (record.transactions && record.transactions.length > 0) {
      const validTransactions = record.transactions.filter(t => t.date !== null);
      if (validTransactions.length > 0) {
        validTransactions.sort((a, b) => {
          if (!a.date || !b.date) return 0;
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
        transactionDate = toLedgerDateString(new Date(validTransactions[0].date!));
      }
    }

    return {
      drug_id: drugId,
      transaction_type: config.type,
      quantity: signedQty,
      date: transactionDate,
      file_name: fileName,
    };
  });

  // Batch insert all transactions
  console.log(`Inserting ${transactions.length} transactions in batch...`);
  const { error: txError } = await supabase.from('inventory_transactions').insert(transactions);

  if (txError) {
    console.error('Batch insert error:', txError);
    // If batch insert fails, fall back to individual inserts
    console.log('Falling back to individual inserts...');
    
    for (const transaction of transactions) {
      try {
        const { error: individualError } = await supabase.from('inventory_transactions').insert(transaction);
        if (individualError) {
          console.error(`Error saving individual transaction:`, individualError);
          errors.push(`Transaction error: ${individualError.message}`);
          skipped += 1;
        } else {
          saved += 1;
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Error in individual insert:`, errorMessage);
        errors.push(`Transaction error: ${errorMessage}`);
        skipped += 1;
      }
    }
  } else {
    saved = transactions.length;
    console.log(`Successfully saved ${saved} transactions in batch`);
  }

  console.log(`Save complete: ${saved} saved, ${skipped} skipped, ${errors.length} errors`);
  return { saved, skipped, errors };
}

async function saveImportedIndividualRows({
  kind,
  rows,
  fileName,
}: {
  kind: ImportKind;
  rows: Array<{ din: string; description?: string; quantity: number; date: Date | null; type: 'purchase' | 'dispense' }>;
  fileName?: string;
}): Promise<SaveResult> {
  const config = KIND_CONFIG[kind];
  let saved = 0;
  let skipped = 0;
  const errors: string[] = [];

  console.log(`Starting to save ${rows.length} individual ${kind} rows...`);

  // Filter out invalid rows first
  const validRows = rows.filter(row => {
    return row.din && row.quantity > 0;
  });

  console.log(`Filtered to ${validRows.length} valid rows out of ${rows.length} total`);
  skipped = rows.length - validRows.length;

  if (validRows.length === 0) {
    console.log('No valid rows to save');
    return { saved: 0, skipped, errors };
  }

  // Batch process: First ensure all drug IDs exist
  const drugIdMap = new Map<string, string>();
  const uniqueDins = [...new Set(validRows.map(r => r.din))];
  
  console.log(`Ensuring ${uniqueDins.length} unique drug IDs exist...`);
  
  for (const din of uniqueDins) {
    try {
      const row = validRows.find(r => r.din === din);
      const drugId = await ensureDrugId(din, row?.description);
      drugIdMap.set(din, drugId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`Error ensuring drug ID for DIN ${din}:`, errorMessage);
      errors.push(`DIN ${din}: ${errorMessage}`);
      // Remove rows with this DIN from valid rows
      const index = validRows.findIndex(r => r.din === din);
      if (index !== -1) {
        validRows.splice(index, 1);
        skipped += 1;
      }
    }
  }

  console.log(`Drug IDs ensured. Preparing ${validRows.length} individual transactions for batch insert...`);

  // Prepare all individual transactions for batch insert
  const transactions = validRows.map(row => {
    const drugId = drugIdMap.get(row.din);
    const signedQty = config.type === 'PURCHASE' ? row.quantity : -row.quantity;
    const transactionDate = toLedgerDateString(row.date ?? new Date());

    return {
      drug_id: drugId,
      transaction_type: config.type,
      quantity: signedQty,
      date: transactionDate,
      file_name: fileName,
    };
  });

  // Batch insert all transactions
  console.log(`Inserting ${transactions.length} individual transactions in batch...`);
  const { error: txError } = await supabase.from('inventory_transactions').insert(transactions);

  if (txError) {
    console.error('Batch insert error:', txError);
    // If batch insert fails, fall back to individual inserts
    console.log('Falling back to individual inserts...');
    
    for (const transaction of transactions) {
      try {
        const { error: individualError } = await supabase.from('inventory_transactions').insert(transaction);
        if (individualError) {
          console.error(`Error saving individual transaction:`, individualError);
          errors.push(`Transaction error: ${individualError.message}`);
          skipped += 1;
        } else {
          saved += 1;
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Error in individual insert:`, errorMessage);
        errors.push(`Transaction error: ${errorMessage}`);
        skipped += 1;
      }
    }
  } else {
    saved = transactions.length;
    console.log(`Successfully saved ${saved} individual transactions in batch`);
  }

  console.log(`Save complete: ${saved} saved, ${skipped} skipped, ${errors.length} errors`);
  return { saved, skipped, errors };
}

export function useImportedRecords(kind: ImportKind) {
  return useQuery({
    queryKey: ['imported-records', kind],
    queryFn: () => fetchImportedRecords(kind),
  });
}

export function useSaveImportedRecords(kind: ImportKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ records, fileName }: { records: ParsedDinData[]; fileName?: string }) => 
      saveImportedRecords({ kind, records, fileName }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['imported-records', kind] });
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      
      // Log any errors that occurred during save
      if (result.errors.length > 0) {
        console.warn('Errors during save:', result.errors);
      }
    },
  });
}

export function useSaveImportedIndividualRows(kind: ImportKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rows, fileName }: { rows: Array<{ din: string; description?: string; quantity: number; date: Date | null; type: 'purchase' | 'dispense' }>; fileName?: string }) => 
      saveImportedIndividualRows({ kind, rows, fileName }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['imported-records', kind] });
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      
      // Log any errors that occurred during save
      if (result.errors.length > 0) {
        console.warn('Errors during save:', result.errors);
      }
    },
  });
}

async function deleteTransactionsByFileName(fileName: string, kind: ImportKind): Promise<number> {
  const config = KIND_CONFIG[kind];
  
  // Check if this is a date-based label (for old records without file_name)
  const isDateBasedLabel = fileName.startsWith('Imported ');
  
  if (isDateBasedLabel) {
    // For old records, delete by transaction_type and date pattern
    // Extract the date from the label (e.g., "Imported 9/5/2025" -> "9/5/2025")
    const dateStr = fileName.replace('Imported ', '');
    
    console.log(`Attempting to delete old records with date label: ${dateStr}`);
    
    // Try to parse the date with multiple formats
    let date: Date | null = null;
    
    // Try DD/MM/YYYY format first (common in many regions)
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts.map(Number);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        // Try DD/MM/YYYY
        date = new Date(year, month - 1, day);
        if (isNaN(date.getTime())) {
          // Try MM/DD/YYYY as fallback
          date = new Date(year, day - 1, month);
        }
      }
    }
    
    // Fallback to standard Date parsing
    if (!date || isNaN(date.getTime())) {
      date = new Date(dateStr);
    }
    
    if (date && !isNaN(date.getTime())) {
      console.log(`Parsed date: ${date.toISOString()}`);
      
      // Get the start and end of that day
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      console.log(`Deleting records between ${startOfDay.toISOString()} and ${endOfDay.toISOString()}`);
      
      const { error, count } = await supabase
        .from('inventory_transactions')
        .delete()
        .eq('transaction_type', config.type)
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString());

      if (error) {
        console.error('Supabase deletion error:', error);
        throw error;
      }
      
      console.log(`Deleted ${count} records`);
      return count || 0;
    } else {
      console.error('Could not parse date from label:', dateStr);
      throw new Error('Could not parse date from old record label');
    }
  } else {
    // For new records with proper file names
    console.log(`Deleting records with file name: ${fileName}`);
    
    const { error, count } = await supabase
      .from('inventory_transactions')
      .delete()
      .eq('file_name', fileName)
      .eq('transaction_type', config.type);

    if (error) {
      console.error('Supabase deletion error:', error);
      throw error;
    }
    
    console.log(`Deleted ${count} records`);
    return count || 0;
  }
}

export function useDeleteImportedFile(kind: ImportKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileName: string) => deleteTransactionsByFileName(fileName, kind),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imported-records', kind] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
    },
  });
}
