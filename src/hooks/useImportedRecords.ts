import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { digitsOf, isValidDin } from '@/lib/din';
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

interface SaveResult {
  saved: number;
  skipped: number;
  errors: string[];
}

/** How each import kind is written to the ledger. */
const KIND_CONFIG: Record<
  ImportKind,
  { type: TransactionType; source: string; notesPrefix: string }
> = {
  purchase: { type: 'PURCHASE', source: 'purchase_import', notesPrefix: 'Purchase import' },
  dispense: { type: 'DISPENSE', source: 'dispense_import', notesPrefix: 'Dispense import' },
  destruction: { type: 'ADJUSTMENT', source: 'destruction_import', notesPrefix: 'Destruction import' },
};

/** One ledger write, before the drug row has been resolved. */
interface PendingTransaction {
  din: string;
  description?: string;
  quantity: number;
  /** Ledger calendar day, `YYYY-MM-DD`. */
  date: string;
}

function quantityForKind(kind: ImportKind, record: ParsedDinData): number {
  if (kind === 'purchase') return Math.abs(record.purchased) || 0;
  if (kind === 'dispense') return Math.abs(record.dispensed) || 0;
  return Math.abs(record.dispensed || record.purchased || 0);
}

/** The most recent dated transaction in a DIN entry, as a ledger calendar day. */
function latestTransactionDate(record: ParsedDinData): string {
  const dated = (record.transactions ?? []).filter(
    (transaction): transaction is { date: Date; quantity: number; type: 'purchase' | 'dispense' } =>
      transaction.date !== null
  );
  if (dated.length === 0) return toLedgerDateString(new Date());

  const latest = dated.reduce((a, b) => (b.date.getTime() > a.date.getTime() ? b : a));
  return toLedgerDateString(latest.date);
}

/** Resolves (or creates) the `drugs` row for a DIN and returns its id. */
async function ensureDrugId(din: string, description?: string): Promise<string> {
  const normalizedDin = digitsOf(din);

  if (!isValidDin(normalizedDin)) {
    throw new Error(`Invalid DIN format: ${din}. DIN must be 6-10 digits.`);
  }

  const { data: existing, error: lookupError } = await supabase
    .from('drugs')
    .select('id')
    .eq('din', normalizedDin)
    .limit(1);

  if (lookupError) {
    throw new Error(`Failed to lookup drug ${normalizedDin}: ${lookupError.message}`);
  }
  if (existing?.[0]?.id) return existing[0].id;

  // Fall back to the CDSA/DPD reference for the product name and CDSA schedule.
  const reference = getDinReferenceEntry(normalizedDin);

  const { data: created, error: createError } = await supabase
    .from('drugs')
    .insert({
      din: normalizedDin,
      description:
        description?.trim() || (reference ? referenceLabel(reference) : '') || `Imported DIN ${normalizedDin}`,
      schedule: reference?.schedule ?? 'Verify',
    })
    .select('id')
    .single();

  if (createError) {
    // A concurrent request may have created the same drug first.
    if (createError.code === '23505' || createError.message.includes('duplicate key')) {
      const { data: retryExisting, error: retryError } = await supabase
        .from('drugs')
        .select('id')
        .eq('din', normalizedDin)
        .limit(1);

      if (retryError) {
        throw new Error(`Failed to lookup drug ${normalizedDin} after duplicate: ${retryError.message}`);
      }
      if (retryExisting?.[0]?.id) return retryExisting[0].id;

      throw new Error(`Drug ${normalizedDin} appears to exist but could not be found after duplicate error`);
    }

    throw new Error(`Failed to create drug ${normalizedDin}: ${createError.message}`);
  }

  return created.id;
}

/**
 * Resolves the drug for every DIN and writes the rows in one batch, falling back to
 * row-by-row inserts when a batch is rejected so one bad row cannot lose the whole file.
 */
async function persistTransactions(
  kind: ImportKind,
  pending: PendingTransaction[],
  fileName?: string
): Promise<SaveResult> {
  const config = KIND_CONFIG[kind];
  const errors: string[] = [];
  const failedDins = new Set<string>();

  const drugIdMap = new Map<string, string>();
  for (const din of new Set(pending.map((row) => row.din))) {
    const description = pending.find((row) => row.din === din)?.description;
    try {
      drugIdMap.set(din, await ensureDrugId(din, description));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`DIN ${din}: ${message}`);
      failedDins.add(din);
    }
  }

  const usable = pending.filter((row) => !failedDins.has(row.din));
  const skipped = pending.length - usable.length;

  if (usable.length === 0) return { saved: 0, skipped, errors };

  const transactions = usable.map((row) => ({
    drug_id: drugIdMap.get(row.din),
    transaction_type: config.type,
    quantity: config.type === 'PURCHASE' ? row.quantity : -row.quantity,
    date: row.date,
    file_name: fileName,
  }));

  const { error: batchError } = await supabase.from('inventory_transactions').insert(transactions);
  if (!batchError) return { saved: transactions.length, skipped, errors };

  console.error('[import] batch insert failed, retrying row by row:', batchError);

  let saved = 0;
  let failed = skipped;
  for (const transaction of transactions) {
    const { error: rowError } = await supabase.from('inventory_transactions').insert(transaction);
    if (rowError) {
      errors.push(`Transaction error: ${rowError.message}`);
      failed += 1;
    } else {
      saved += 1;
    }
  }

  return { saved, skipped: failed, errors };
}

/** Aggregated import: one ledger row per DIN (used by reconciliation-style imports). */
async function saveImportedRecords({
  kind,
  records,
  fileName,
}: {
  kind: ImportKind;
  records: ParsedDinData[];
  fileName?: string;
}): Promise<SaveResult> {
  const valid = records.filter((record) => record.din && quantityForKind(kind, record) > 0);
  const invalidCount = records.length - valid.length;

  const result = await persistTransactions(
    kind,
    valid.map((record) => ({
      din: record.din,
      description: record.description,
      quantity: quantityForKind(kind, record),
      date: latestTransactionDate(record),
    })),
    fileName
  );

  return { ...result, skipped: result.skipped + invalidCount };
}

/** Per-row import: one ledger row per reported transaction. */
async function saveImportedIndividualRows({
  kind,
  rows,
  fileName,
}: {
  kind: ImportKind;
  rows: Array<{ din: string; description?: string; quantity: number; date: Date | null; type: 'purchase' | 'dispense' }>;
  fileName?: string;
}): Promise<SaveResult> {
  const valid = rows.filter((row) => row.din && row.quantity > 0);
  const invalidCount = rows.length - valid.length;

  const result = await persistTransactions(
    kind,
    valid.map((row) => ({
      din: row.din,
      description: row.description,
      quantity: row.quantity,
      date: toLedgerDateString(row.date ?? new Date()),
    })),
    fileName
  );

  return { ...result, skipped: result.skipped + invalidCount };
}

/** The API returns at most this many rows per request, so the ledger is paged through. */
const FETCH_PAGE_SIZE = 1000;

interface ImportedRow {
  id: string;
  quantity: number | null;
  created_at: string | null;
  date: string | null;
  file_name: string | null;
  drugs: { din: string; description: string } | null;
}

async function fetchImportedRecords(kind: ImportKind): Promise<ImportedRecordRow[]> {
  const config = KIND_CONFIG[kind];
  const rows: ImportedRow[] = [];

  // A single request only returns the first page, which silently dropped older records
  // and made the monthly totals short, so keep paging to the end.
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('inventory_transactions')
      .select('id, quantity, created_at, date, file_name, drugs!inner(din, description)')
      .eq('transaction_type', config.type)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as unknown as ImportedRow[];
    rows.push(...page);
    if (page.length < FETCH_PAGE_SIZE) break;
  }

  return rows.map((row) => ({
    id: row.id,
    din: row.drugs?.din ?? '--------',
    description: row.drugs?.description ?? 'Unknown',
    quantity: Math.abs(Number(row.quantity ?? 0)),
    type: config.type,
    source: config.source,
    created_at: row.date || row.created_at || new Date().toISOString(),
    file_name: row.file_name ?? undefined,
  }));
}

export function useImportedRecords(kind: ImportKind) {
  return useQuery({
    queryKey: ['imported-records', kind],
    queryFn: () => fetchImportedRecords(kind),
  });
}

function useSaveMutation<T>(
  kind: ImportKind,
  mutationFn: (variables: T) => Promise<SaveResult>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['imported-records', kind] });
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });

      if (result.errors.length > 0) {
        console.error('[import] some rows could not be saved:', result.errors);
      }
    },
  });
}

export function useSaveImportedRecords(kind: ImportKind) {
  return useSaveMutation(kind, ({ records, fileName }: { records: ParsedDinData[]; fileName?: string }) =>
    saveImportedRecords({ kind, records, fileName })
  );
}

export function useSaveImportedIndividualRows(kind: ImportKind) {
  return useSaveMutation(
    kind,
    ({
      rows,
      fileName,
    }: {
      rows: Array<{ din: string; description?: string; quantity: number; date: Date | null; type: 'purchase' | 'dispense' }>;
      fileName?: string;
    }) => saveImportedIndividualRows({ kind, rows, fileName })
  );
}

/** A file label written by an older version of the app, e.g. "Imported 9/5/2025". */
const LEGACY_LABEL_PREFIX = 'Imported ';

async function deleteTransactionsByFileName(fileName: string, kind: ImportKind): Promise<number> {
  const config = KIND_CONFIG[kind];

  // Older records were saved before file names existed, so they can only be removed by
  // the day they were imported.
  if (fileName.startsWith(LEGACY_LABEL_PREFIX)) {
    const parsed = parseLegacyLabel(fileName.slice(LEGACY_LABEL_PREFIX.length));
    if (!parsed) throw new Error('Could not parse date from old record label');

    const startOfDay = new Date(parsed);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(parsed);
    endOfDay.setHours(23, 59, 59, 999);

    const { error, count } = await supabase
      .from('inventory_transactions')
      .delete()
      .eq('transaction_type', config.type)
      .gte('created_at', startOfDay.toISOString())
      .lte('created_at', endOfDay.toISOString());

    if (error) throw error;
    return count || 0;
  }

  const { error, count } = await supabase
    .from('inventory_transactions')
    .delete()
    .eq('file_name', fileName)
    .eq('transaction_type', config.type);

  if (error) throw error;
  return count || 0;
}

/** Parses "9/5/2025" (day-first, then month-first) or any string a Date accepts. */
function parseLegacyLabel(label: string): Date | null {
  const parts = label.split('/').map(Number);
  if (parts.length === 3 && parts.every((part) => !isNaN(part))) {
    const [day, month, year] = parts;
    const dayFirst = new Date(year, month - 1, day);
    if (!isNaN(dayFirst.getTime())) return dayFirst;
    const monthFirst = new Date(year, day - 1, month);
    if (!isNaN(monthFirst.getTime())) return monthFirst;
  }

  const fallback = new Date(label);
  return isNaN(fallback.getTime()) ? null : fallback;
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
