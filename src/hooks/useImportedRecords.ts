import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useConfirm } from '@/components/ui/ConfirmDialog';
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
  /** Ledger entries merged into this row (the list is aggregated per file, drug and day). */
  entries?: number;
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

/**
 * The NET quantity of a DIN in the direction of the import kind. Negative rows (returns,
 * reversals, corrections) are kept and reduce the total - never `Math.abs`.
 */
function quantityForKind(kind: ImportKind, record: ParsedDinData): number {
  if (kind === 'purchase') return normalizeQuantity(record.purchased);
  if (kind === 'dispense') return normalizeQuantity(record.dispensed);
  return normalizeQuantity(record.dispensed || record.purchased);
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

/** Rows per request. The database accepts at most 50,000 per call. */
const IMPORT_CHUNK_SIZE = 20_000;

/** The database refuses a single ledger row above this quantity. */
const MAX_ROW_QUANTITY = 1_000_000;

/** How an import treats a file name that is already in the ledger. */
type ImportMode = 'new' | 'replace';

/** Thrown when the file name was already imported and the user has not agreed to replace it. */
class AlreadyImportedError extends Error {
  constructor(readonly fileName: string | undefined) {
    super('This file was already imported');
    this.name = 'AlreadyImportedError';
  }
}

/** Thrown when the user declines to replace an earlier import. */
class ImportCancelledError extends Error {
  constructor() {
    super('Import cancelled - nothing was saved');
    this.name = 'ImportCancelledError';
  }
}

/**
 * Merges rows of the same drug and day into one ledger row.
 *
 * The ledger stores a drug, a quantity and a day per row - nothing identifies the individual
 * prescription - so a dispensing file of 160,000 lines becomes a few thousand rows with
 * exactly the same totals. That is what keeps the save, the stock maths and the record
 * lists fast. A quantity above the per-row limit is split rather than rejected.
 */
export function mergeByDinAndDate(pending: PendingTransaction[]): PendingTransaction[] {
  const merged = new Map<string, PendingTransaction>();

  for (const row of pending) {
    const din = digitsOf(row.din);
    const key = `${din}|${row.date}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += row.quantity;
      if (!existing.description && row.description) existing.description = row.description;
    } else {
      merged.set(key, { din, description: row.description, quantity: row.quantity, date: row.date });
    }
  }

  const result: PendingTransaction[] = [];
  for (const row of merged.values()) {
    // Returns and purchases of the same day cancel out; a net of zero is not worth a row.
    if (row.quantity === 0) continue;

    const sign = row.quantity < 0 ? -1 : 1;
    let remaining = Math.abs(row.quantity);
    while (remaining > MAX_ROW_QUANTITY) {
      result.push({ ...row, quantity: sign * MAX_ROW_QUANTITY });
      remaining -= MAX_ROW_QUANTITY;
    }
    result.push({ ...row, quantity: sign * remaining });
  }
  return result;
}

/**
 * Writes the rows through `import_ledger_rows`: ONE call per 20,000 rows that validates
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
  fileName: string | undefined,
  mode: ImportMode
): Promise<SaveResult> {
  const sentDescription = new Set<string>();

  const rows = mergeByDinAndDate(pending).map((row) => {
    const din = row.din;
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

  const result: SaveResult = { saved: 0, skipped: 0, notSent: { noDin: 0, noQuantity: 0 }, errors: [] };

  for (let start = 0; start < rows.length; start += IMPORT_CHUNK_SIZE) {
    const { data, error } = await supabase.rpc('import_ledger_rows', {
      p_kind: kind,
      p_file_name: fileName ?? null,
      p_rows: rows.slice(start, start + IMPORT_CHUNK_SIZE),
      // Only the first chunk checks for / replaces an earlier import of the same file.
      p_mode: start === 0 ? mode : 'append',
    });

    if (error) {
      if (error.message?.includes('ALREADY_IMPORTED')) throw new AlreadyImportedError(fileName);
      throw error;
    }

    const chunk = data as { saved: number; skipped: number; errors: string[] };
    result.saved += chunk.saved;
    result.skipped += chunk.skipped;
    result.errors.push(...chunk.errors);
  }

  return result;
}

/** Aggregated import: one ledger row per DIN (used by reconciliation-style imports). */
async function saveImportedRecords(
  {
    kind,
    records,
    fileName,
  }: {
    kind: ImportKind;
    records: ParsedDinData[];
    fileName?: string;
  },
  mode: ImportMode
): Promise<SaveResult> {
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
    fileName,
    mode
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
async function saveImportedIndividualRows(
  {
    kind,
    rows,
    fileName,
  }: {
    kind: ImportKind;
    rows: ParsedIndividualRow[];
    fileName?: string;
  },
  mode: ImportMode
): Promise<SaveResult> {
  const valid = rows.filter((row) => row.din && normalizeQuantity(row.quantity) !== 0);
  const invalidCount = rows.length - valid.length;

  const result = await persistTransactions(
    kind,
    valid.map((row) => ({
      din: row.din,
      description: row.description,
      quantity: normalizeQuantity(row.quantity),
      date: toLedgerDateString(row.date ?? new Date()),
    })),
    fileName,
    mode
  );

  return {
    ...result,
    skipped: result.skipped + invalidCount,
    notSent: {
      noDin: result.notSent.noDin + rows.filter((row) => !row.din).length,
      noQuantity:
        result.notSent.noQuantity +
        rows.filter((row) => row.din && normalizeQuantity(row.quantity) === 0).length,
    },
  };
}

interface ImportedRecordPayload {
  id: string;
  din: string | null;
  description: string | null;
  quantity: number | string | null;
  created_at: string | null;
  file_name: string | null;
  entries: number;
}

/**
 * The record list for one kind, aggregated by file, drug and day on the database and
 * returned as ONE document. (It used to page through every ledger row 1,000 at a time:
 * 161 sequential requests for a 161,000-row dispensing file.)
 *
 * `imported_records` already returns the NET quantity in the direction of the kind - the
 * sign is flipped for dispenses and destructions there - so the value is passed through as
 * reported instead of being taken as a magnitude, which would count every reversal as a
 * dispensation.
 */
async function fetchImportedRecords(kind: ImportKind): Promise<ImportedRecordRow[]> {
  const config = KIND_CONFIG[kind];
  const { data, error } = await supabase.rpc('imported_records', { p_kind: kind });
  if (error) throw error;

  return ((data ?? []) as unknown as ImportedRecordPayload[]).map((row) => ({
    id: row.id,
    din: row.din ?? '--------',
    description: row.description ?? 'Unknown',
    quantity: normalizeQuantity(row.quantity),
    type: config.type,
    source: config.source,
    created_at: row.created_at || new Date().toISOString(),
    file_name: row.file_name ?? undefined,
    entries: row.entries,
  }));
}

export function useImportedRecords(kind: ImportKind) {
  return useQuery({
    queryKey: ['imported-records', kind],
    queryFn: () => fetchImportedRecords(kind),
    enabled: kind === 'purchase' || kind === 'dispense' || kind === 'destruction',
  });
}

function useSaveMutation<T extends { fileName?: string }>(
  kind: ImportKind,
  mutationFn: (variables: T, mode: ImportMode) => Promise<SaveResult>
) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  return useMutation({
    mutationFn: async (variables: T): Promise<SaveResult> => {
      try {
        return await mutationFn(variables, 'new');
      } catch (error) {
        if (!(error instanceof AlreadyImportedError)) throw error;

        // The same file name is already in the ledger: importing it again would double
        // every quantity, so the earlier import is only replaced with the user's consent.
        const replace = await confirm({
          title: 'This file was already imported',
          description:
            `"${variables.fileName ?? 'This file'}" is already in your records. Replace the earlier import? ` +
            'The earlier rows are voided (they stay in Transaction History) and this file is saved instead.',
          confirmLabel: 'Replace',
          destructive: true,
        });
        if (!replace) throw new ImportCancelledError();
        return mutationFn(variables, 'replace');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imported-records', kind] });
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useSaveImportedRecords(kind: ImportKind) {
  return useSaveMutation(
    kind,
    (variables: { records: ParsedDinData[]; fileName?: string }, mode) =>
      saveImportedRecords({ kind, ...variables }, mode)
  );
}

export function useSaveImportedIndividualRows(kind: ImportKind) {
  return useSaveMutation(
    kind,
    (variables: { rows: ParsedIndividualRow[]; fileName?: string }, mode) =>
      saveImportedIndividualRows({ kind, ...variables }, mode)
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
