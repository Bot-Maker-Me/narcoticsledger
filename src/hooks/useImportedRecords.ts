import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { digitsOf } from '@/lib/din';
import { getDinReferenceEntry, referenceLabel } from '@/lib/dinReference';
import { toLedgerDateString } from '@/lib/ledgerDate';
import { normalizeQuantity, type ImportKind } from '@/lib/ledgerQuantity';
import type { ParsedDinData } from '@/types/reconciliation';
import type { ParsedIndividualRow } from '@/lib/fileParser';
import type { TransactionType } from '@/types/transaction';

export type { ImportKind };

/** The ledger label used for rows created by hand rather than imported from a file. */
export const MANUAL_ENTRY_LABEL = 'Manual entry';

/** The ledger label used for rows written by `dispense_prescription`. */
export const PRESCRIPTION_LABEL = 'Prescription';

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
  /** Why rows never reached the database, so a screen can say more than "N skipped". */
  notSent: { noDin: number; noQuantity: number };
  errors: string[];
}

/** A one-line reason list for the rows a save left out, e.g. "312 with no quantity". */
export function describeSkipped(result: SaveResult): string {
  const parts: string[] = [];
  if (result.notSent.noDin > 0) parts.push(`${result.notSent.noDin} with no DIN`);
  if (result.notSent.noQuantity > 0) parts.push(`${result.notSent.noQuantity} with no quantity`);

  const rejected = result.skipped - result.notSent.noDin - result.notSent.noQuantity;
  if (rejected > 0) parts.push(`${rejected} rejected by the ledger`);

  return parts.join(', ');
}

/** How each import kind is written to the ledger. */
const KIND_CONFIG: Record<ImportKind, { type: TransactionType; source: string }> = {
  purchase: { type: 'PURCHASE', source: 'purchase_import' },
  dispense: { type: 'DISPENSE', source: 'dispense_import' },
  destruction: { type: 'ADJUSTMENT', source: 'destruction_import' },
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
  if (kind === 'purchase') return normalizeQuantity(kind, record.purchased);
  if (kind === 'dispense') return normalizeQuantity(kind, record.dispensed);
  return normalizeQuantity(kind, record.dispensed || record.purchased);
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

/** Rows per request. A 10,000-row chunk is ~1 MB of JSON and one database transaction. */
const IMPORT_CHUNK_SIZE = 10_000;

/**
 * Writes the rows through `import_ledger_rows`: ONE call per 10,000 rows that validates
 * every row, creates any missing drug and inserts the ledger entries atomically, with an
 * audit-log entry. (This used to be one lookup per DIN, then a batch insert, then a
 * row-by-row retry loop - hundreds of round trips for a normal file.)
 *
 * The CDSA reference supplies the drug name and schedule for DINs the pharmacy has not
 * seen before; it is already cached from the background parse that ran on upload.
 */
async function persistTransactions(
  kind: ImportKind,
  pending: PendingTransaction[],
  fileName?: string
): Promise<SaveResult> {
  const sentDescription = new Set<string>();

  const rows = pending.map((row) => {
    const din = digitsOf(row.din);
    const first = !sentDescription.has(din);
    sentDescription.add(din);

    // Description and schedule only matter once per DIN (the server creates the drug once).
    let description: string | undefined;
    let schedule: string | undefined;
    if (first) {
      const reference = getDinReferenceEntry(din);
      description = row.description?.trim() || (reference ? referenceLabel(reference) : '') || undefined;
      schedule = reference?.schedule ?? undefined;
    }

    return { din, description, schedule, quantity: String(row.quantity), date: row.date };
  });

  const result: SaveResult = {
    saved: 0,
    skipped: 0,
    notSent: { noDin: 0, noQuantity: 0 },
    errors: [],
  };

  for (let start = 0; start < rows.length; start += IMPORT_CHUNK_SIZE) {
    const { data, error } = await supabase.rpc('import_ledger_rows', {
      p_kind: kind,
      p_file_name: fileName ?? null,
      p_rows: rows.slice(start, start + IMPORT_CHUNK_SIZE),
    });

    if (error) throw error;

    const chunk = data as { saved: number; skipped: number; errors: string[] };
    result.saved += chunk.saved;
    result.skipped += chunk.skipped;
    result.errors.push(...chunk.errors);
  }

  return result;
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
  const valid = records.filter((record) => record.din && quantityForKind(kind, record) !== 0);
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

  return {
    ...result,
    skipped: result.skipped + invalidCount,
    notSent: {
      noDin: result.notSent.noDin + records.filter((record) => !record.din).length,
      noQuantity:
        result.notSent.noQuantity +
        records.filter((record) => record.din && quantityForKind(kind, record) === 0).length,
    },
  };
}

/** Per-row import: one ledger row per reported transaction. */
async function saveImportedIndividualRows({
  kind,
  rows,
  fileName,
}: {
  kind: ImportKind;
  rows: ParsedIndividualRow[];
  fileName?: string;
}): Promise<SaveResult> {
  const valid = rows.filter((row) => row.din && normalizeQuantity(kind, row.quantity) !== 0);
  const invalidCount = rows.length - valid.length;

  const result = await persistTransactions(
    kind,
    valid.map((row) => ({
      din: row.din,
      description: row.description,
      quantity: normalizeQuantity(kind, row.quantity),
      date: toLedgerDateString(row.date ?? new Date()),
    })),
    fileName
  );

  return {
    ...result,
    skipped: result.skipped + invalidCount,
    notSent: {
      noDin: result.notSent.noDin + rows.filter((row) => !row.din).length,
      noQuantity:
        result.notSent.noQuantity +
        rows.filter((row) => row.din && normalizeQuantity(kind, row.quantity) === 0).length,
    },
  };
}

/** The API returns at most this many rows per request, so the ledger is paged through. */
const FETCH_PAGE_SIZE = 1000;

/** How many of those pages are read at once. */
const PAGES_IN_FLIGHT = 6;

interface ImportedRow {
  id: string;
  quantity: number | null;
  created_at: string | null;
  date: string | null;
  file_name: string | null;
  drugs: { din: string; description: string } | null;
}

/** One page of the ledger, newest first. */
async function fetchLedgerPage(kind: ImportKind, page: number): Promise<ImportedRow[]> {
  const config = KIND_CONFIG[kind];
  const from = page * FETCH_PAGE_SIZE;

  const { data, error } = await supabase
    .from('inventory_transactions')
    .select('id, quantity, created_at, date, file_name, drugs!inner(din, description)')
    .eq('transaction_type', config.type)
    .is('voided_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + FETCH_PAGE_SIZE - 1);

  if (error) throw error;
  return (data ?? []) as unknown as ImportedRow[];
}

async function fetchImportedRecords(kind: ImportKind): Promise<ImportedRecordRow[]> {
  const config = KIND_CONFIG[kind];
  const rows: ImportedRow[] = [];

  // A single request only returns the first page, which silently dropped older records
  // and made the monthly totals short, so keep paging to the end. The first page doubles
  // as a probe: only a full page means there is more to read.
  const first = await fetchLedgerPage(kind, 0);
  rows.push(...first);

  if (first.length === FETCH_PAGE_SIZE) {
    // The remaining pages are read a batch at a time. One at a time, a 42,000-row ledger
    // is 42 round trips of ~0.5 s each, which left the screen loading for ~20 seconds.
    for (let page = 1; ; page += PAGES_IN_FLIGHT) {
      const batch = await Promise.all(
        Array.from({ length: PAGES_IN_FLIGHT }, (_, offset) => fetchLedgerPage(kind, page + offset))
      );

      for (const pageRows of batch) rows.push(...pageRows);

      // The ledger ends at the first short page, so any pages after it came back empty.
      if (batch.some((pageRows) => pageRows.length < FETCH_PAGE_SIZE)) break;
    }
  }

  return rows.map((row) => ({
    id: row.id,
    din: row.drugs?.din ?? '--------',
    description: row.drugs?.description ?? 'Unknown',
    quantity: normalizeQuantity(kind, row.quantity),
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
    enabled: kind === 'purchase' || kind === 'dispense' || kind === 'destruction',
    // A month of dispensing records is 40+ paged requests. Without this, every visit to a
    // record browser (and every remount of the upload screen) downloaded the whole ledger
    // again. Imports and file deletions invalidate this key, so changes still show up at
    // once; only plain navigation reuses what is already in the cache.
    staleTime: 60_000,
  });
}

function useSaveMutation<T>(
  kind: ImportKind,
  mutationFn: (variables: T) => Promise<SaveResult>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imported-records', kind] });
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
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
    ({ rows, fileName }: { rows: ParsedIndividualRow[]; fileName?: string }) =>
      saveImportedIndividualRows({ kind, rows, fileName })
  );
}

/** A file label written by an older version of the app, e.g. "Imported 9/5/2025". */
const LEGACY_LABEL_PREFIX = 'Imported ';

/**
 * Voids a file's ledger rows instead of deleting them.
 *
 * `inventory_transactions` is append-only at the database level (the `authenticated` role
 * only has SELECT and INSERT), so the audit trail always survives. Voided rows drop out of
 * stock maths and the record browsers via `voided_at`.
 */
async function voidImportedFile(fileName: string, kind: ImportKind): Promise<number> {
  const config = KIND_CONFIG[kind];

  // Older records were saved before file names existed, so they can only be located by the
  // day they were imported.
  if (fileName.startsWith(LEGACY_LABEL_PREFIX)) {
    const parsed = parseLegacyLabel(fileName.slice(LEGACY_LABEL_PREFIX.length));
    if (!parsed) throw new Error('Could not parse a date from this old record label');

    const startOfDay = new Date(parsed);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(parsed);
    endOfDay.setHours(23, 59, 59, 999);

    const { data, error } = await supabase.rpc('void_imported_records', {
      p_transaction_type: config.type,
      p_file_name: null,
      p_start: startOfDay.toISOString(),
      p_end: endOfDay.toISOString(),
    });

    if (error) throw error;
    return Number(data ?? 0);
  }

  const { data, error } = await supabase.rpc('void_imported_records', {
    p_transaction_type: config.type,
    p_file_name: fileName,
    p_start: null,
    p_end: null,
  });

  if (error) throw error;
  return Number(data ?? 0);
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

/**
 * The raw void mutation. Screens should use `useDeleteImportedFile` from
 * `@/hooks/useDeleteImportedFile` instead, which adds the confirmation step and the toast.
 */
export function useVoidImportedFile(kind: ImportKind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileName: string) => voidImportedFile(fileName, kind),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imported-records', kind] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
    },
  });
}
