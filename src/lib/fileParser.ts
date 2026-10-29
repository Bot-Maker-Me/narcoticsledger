import { readSupplierFile, type ParsedFile, type ParsedRow } from '@/lib/readRows';
import {
  DATE_COLUMNS,
  DESCRIPTION_COLUMNS,
  DIN_COLUMNS,
  INVOICE_COLUMNS,
  PACK_SIZE_COLUMNS,
  PRODUCT_COLUMNS,
  QTY_COLUMNS,
  ROW_ID_COLUMNS,
  TYPE_COLUMNS,
  findColumnKey,
  findExactColumnKey,
} from '@/lib/columns';
import { isSupportedFile } from '@/lib/uploadValidation';
import { reportError } from '@/lib/errors';
import { normalizeDin } from '@/lib/din';
import { fetchReferenceEntries } from '@/lib/dinReference';
import type { ParsedDinData } from '@/types/reconciliation';

export interface FilePreview {
  fileName: string;
  fileSize: number;
  format: 'csv' | 'xlsx' | 'xls';
  totalRows: number;
  uniqueDINs: number;
  sampleData: Array<Record<string, unknown>>;
  detectedColumns: string[];
  dateRange?: { start: Date | null; end: Date | null };
}

/** One parsed transaction row, with the quantity already converted to total units. */
export interface ParsedIndividualRow {
  din: string;
  description?: string;
  /** Total units: packs x pack size for purchases, dispensed units for dispensations. */
  quantity: number;
  date: Date | null;
  type: 'purchase' | 'dispense';
  /** The multiplier that was applied to turn packs into units (1 when none). */
  packSize: number;
}

/**
 * Returns the pack size for a DIN from the CDSA/DPD reference, or null when the DIN
 * is unknown. It is only a fallback for files that do not state a pack size in the row.
 */
export type PackSizeResolver = (din: string) => number | null;

export { isSupportedFile };

/** Rows handled between two pauses that let the browser paint and answer clicks. */
const YIELD_EVERY_ROWS = 20_000;

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Starts reading the given files and resolving their DINs against the CDSA reference in
 * the background. Call it as soon as files are dropped: by the time the user presses
 * "Process" every row is already in memory and the reference is cached, so parsing is
 * effectively instant. Errors are left for the real parse to report.
 */
export async function prepareFiles(files: File[]): Promise<void> {
  const parsedFiles = await Promise.all(files.map((file) => readSupplierFile(file)));
  const dins = new Set<string>();
  for (const { rows } of parsedFiles) collectDins(rows, dins);
  await lookupReference([...dins]);
}

function createFilePreview(file: File, parsed: ParsedFile, uniqueDINs: number): FilePreview {
  const ext = file.name.split('.').pop()?.toLowerCase() as 'csv' | 'xlsx' | 'xls';

  return {
    fileName: file.name,
    fileSize: file.size,
    format: ext,
    totalRows: parsed.rows.length,
    uniqueDINs,
    sampleData: parsed.sample,
    detectedColumns: parsed.columns,
    dateRange: detectDateRange(parsed.rows),
  };
}

/**
 * Find matching DIN in a dataset by trying progressive zero-padding
 * If exact match not found, tries with leading zeros up to 8 digits
 * Also handles the reverse: trying to remove leading zeros to find matches
 */
function findMatchingDin(din: string, dataset: Map<string, ParsedDinData>): string | null {
  if (dataset.has(din)) return din;

  const cleaned = din.replace(/^0+/, '');
  for (let length = cleaned.length; length <= 8; length++) {
    const padded = cleaned.padStart(length, '0');
    if (dataset.has(padded)) return padded;
  }

  for (let length = 8; length >= cleaned.length; length--) {
    const truncated = din.slice(8 - length);
    if (dataset.has(truncated)) return truncated;
  }

  return null;
}

/** The columns that take part in a row signature, resolved once per file. */
interface SignatureKeys {
  invoiceKey: string | null;
  productKey: string | null;
  descKey: string | null;
  rowIdKey: string | null;
}

function resolveSignatureKeys(keys: string[]): SignatureKeys {
  return {
    invoiceKey: findColumnKey(keys, INVOICE_COLUMNS),
    productKey: findColumnKey(keys, PRODUCT_COLUMNS),
    descKey: findColumnKey(keys, DESCRIPTION_COLUMNS),
    rowIdKey: findExactColumnKey(keys, ROW_ID_COLUMNS),
  };
}

function buildSignature(
  din: string,
  quantity: number,
  day: string | null,
  row: ParsedRow,
  keys: SignatureKeys
): string {
  const parts: Array<string | number> = [din, quantity];

  if (day) parts.push(day);

  if (keys.invoiceKey && row[keys.invoiceKey]) {
    parts.push(String(row[keys.invoiceKey]).trim());
  }

  // Product number / description: one invoice can hold several products that share a DIN
  // (e.g. a 100-pack and a 200-pack) with the same quantity. Without this they were
  // wrongly treated as duplicates and dropped.
  if (keys.productKey && row[keys.productKey]) {
    parts.push(`p${String(row[keys.productKey]).trim()}`);
  }
  if (keys.descKey && row[keys.descKey]) {
    parts.push(String(row[keys.descKey]).trim().replace(/\s+/g, ' ').toUpperCase());
  }

  // Dispensing exports: the prescription number tells two real dispenses of the same
  // drug, quantity and day apart (they used to collapse into one).
  if (keys.rowIdKey && row[keys.rowIdKey]) {
    parts.push(`rx${String(row[keys.rowIdKey]).trim()}`);
  }

  // Fallback: hash of relevant row data
  if (parts.length === 2) {
    parts.push(JSON.stringify({ din, quantity, date: day }));
  }

  return parts.join('|');
}

function dayOf(date: Date | null): string | null {
  return date ? date.toISOString().split('T')[0] : null;
}

/**
 * Generate a unique signature for a row to detect duplicates
 * Uses DIN, quantity, date, and optionally invoice/transaction/prescription number
 */
export function generateRowSignature(
  din: string,
  quantity: number,
  date: Date | null,
  row: ParsedRow
): string {
  return buildSignature(din, quantity, dayOf(date), row, resolveSignatureKeys(Object.keys(row)));
}

function extractNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Math.round(value);
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed);
}

function extractDate(value: unknown): Date | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;

  // Excel serial date
  if (typeof value === 'number' && value > 0) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    if (!isNaN(date.getTime())) return date;
  }

  const date = new Date(str);
  return isNaN(date.getTime()) ? null : date;
}

interface ParsedDate {
  date: Date | null;
  /** `YYYY-MM-DD` (UTC), used by the duplicate check. */
  day: string | null;
}

/**
 * Date parsing with a per-file cache: a file with 160,000 rows has a few hundred distinct
 * date strings, and `new Date(string)` is by far the slowest step of a row.
 */
function createDateParser(): (value: unknown) => ParsedDate {
  const cache = new Map<string, ParsedDate>();

  return (value) => {
    if (typeof value !== 'string') {
      const date = extractDate(value);
      return { date, day: dayOf(date) };
    }

    let entry = cache.get(value);
    if (!entry) {
      const date = extractDate(value);
      entry = { date, day: dayOf(date) };
      cache.set(value, entry);
    }
    return entry;
  };
}

function detectDateRange(rows: ParsedRow[]): { start: Date | null; end: Date | null } {
  if (rows.length === 0) return { start: null, end: null };

  const dateKey = findColumnKey(Object.keys(rows[0]), DATE_COLUMNS);
  if (!dateKey) return { start: null, end: null };

  const parseDate = createDateParser();
  let start: Date | null = null;
  let end: Date | null = null;
  for (const row of rows) {
    const { date } = parseDate(row[dateKey]);
    if (!date) continue;
    if (!start || date < start) start = date;
    if (!end || date > end) end = date;
  }
  return { start, end };
}

/** Sanity bounds for a pack size read out of a product description. */
const MIN_PACK_SIZE = 2;
const MAX_PACK_SIZE = 6000;

/**
 * Purchases are reported in packs and the pack size is the trailing number of the
 * product description, e.g. "DILAUDID TB 8MG          100" -> 100,
 * "HYDROMORPH CONTIN CAP12MG 60" -> 60, "PMS BUPREN NAL TB 8MG/2MG 30" -> 30.
 *
 * Returns null when the description has no usable trailing number, e.g.
 * "ODAN METHAD UNFLAV SF SOL 1L" (a single bottle is the pack) or
 * "PDP HYDROCODONE 1MG/ML 500ML" (a 500 mL bottle is still one unit).
 */
function extractPackSizeFromDescription(description: unknown): number | null {
  const desc = String(description ?? '').trim();
  // A real description always contains letters; this keeps a stray date or price cell
  // from ever being read as a pack size.
  if (!desc || !/[A-Za-z]/.test(desc)) return null;

  // The pack size is the number that ends the description. A description ending in a
  // unit ("8MG", "500ML", "5G") is not a pack size, so it falls through to null.
  const match = desc.match(/(\d{1,4})\s*$/);
  if (!match) return null;

  const size = parseInt(match[1], 10);
  if (!Number.isFinite(size) || size < MIN_PACK_SIZE || size > MAX_PACK_SIZE) return null;
  return size;
}

/**
 * Resolves the pack size for a single imported row.
 *
 * The description wins, because one DIN can legitimately arrive in different pack
 * sizes (e.g. TEVA OXYCOC 100s and 500s in the same file) and each row has to be
 * converted with its own pack size. An explicit pack-size column is only used when
 * the description carries no number, and the drug/reference pack size only when the
 * file says nothing at all.
 */
function resolvePackSize(
  row: ParsedRow,
  din: string,
  descriptionKey: string | null,
  packSizeKey: string | null,
  packSizeFor?: PackSizeResolver
): number {
  const fromDescription = extractPackSizeFromDescription(descriptionKey ? row[descriptionKey] : null);
  if (fromDescription !== null) return fromDescription;

  if (packSizeKey) {
    const fromColumn = extractNumber(row[packSizeKey]);
    if (fromColumn > 1) return fromColumn;
  }

  const resolved = packSizeFor ? packSizeFor(din) : null;
  return resolved !== null && resolved > 1 ? resolved : 1;
}

function resolveTransactionType(
  row: ParsedRow,
  source: 'mckesson' | 'kroll',
  typeKey: string | null
): 'purchase' | 'dispense' {
  if (source === 'mckesson') return 'purchase';

  const typeVal = typeKey ? String(row[typeKey] ?? '').toLowerCase() : '';
  const isPurchase =
    typeVal.includes('purchase') || typeVal.includes('receive') || typeVal.includes('adjust+');
  return isPurchase ? 'purchase' : 'dispense';
}

/** Every column a parsed row needs, resolved once per file. */
interface RowColumns {
  dinKey: string;
  qtyKey: string | null;
  typeKey: string | null;
  dateKey: string | null;
  descKey: string | null;
  packSizeKey: string | null;
  signature: SignatureKeys;
}

function resolveColumns(rows: ParsedRow[], source: 'mckesson' | 'kroll'): RowColumns {
  const keys = Object.keys(rows[0]);
  const dinKey = findColumnKey(keys, DIN_COLUMNS);

  if (!dinKey) {
    throw new Error(
      source === 'mckesson'
        ? 'Could not find a DIN column in the McKesson file. Expected a column named "DIN" or similar.'
        : 'Could not find a DIN column in the Kroll file. Expected a column named "DIN" or similar.'
    );
  }

  return {
    dinKey,
    qtyKey: findColumnKey(keys, QTY_COLUMNS[source]),
    typeKey: findColumnKey(keys, TYPE_COLUMNS),
    dateKey: findColumnKey(keys, DATE_COLUMNS),
    descKey: findColumnKey(keys, DESCRIPTION_COLUMNS),
    packSizeKey: findColumnKey(keys, PACK_SIZE_COLUMNS),
    signature: resolveSignatureKeys(keys),
  };
}

/** Adds every DIN of the file to `into`, so each one is looked up once. */
function collectDins(rows: ParsedRow[], into: Set<string> = new Set()): Set<string> {
  if (rows.length === 0) return into;
  const dinKey = findColumnKey(Object.keys(rows[0]), DIN_COLUMNS);
  if (!dinKey) return into;
  for (const row of rows) into.add(String(row[dinKey] ?? ''));
  return into;
}

async function lookupReference(dins: string[]): Promise<void> {
  if (dins.length === 0) return;
  try {
    await fetchReferenceEntries(dins);
  } catch (error) {
    reportError(error, { scope: 'din-reference' });
  }
}

/**
 * Resolves the server-side CDSA/DPD reference for every DIN in the file before the rows
 * are aggregated, so drug names, schedules and pack sizes are available while parsing.
 */
async function prefetchDinReference(rows: ParsedRow[]): Promise<void> {
  await lookupReference([...collectDins(rows)]);
}

/** Aggregates a file's rows into one entry per DIN (used by reconciliation imports). */
async function aggregateRows(
  rows: ParsedRow[],
  source: 'mckesson' | 'kroll',
  seenSignatures?: Set<string>,
  packSizeFor?: PackSizeResolver
): Promise<Map<string, ParsedDinData>> {
  if (rows.length === 0) return new Map();

  const { dinKey, qtyKey, typeKey, dateKey, descKey, packSizeKey, signature } = resolveColumns(rows, source);
  const parseDate = createDateParser();
  const result = new Map<string, ParsedDinData>();

  for (let index = 0; index < rows.length; index += 1) {
    if (index > 0 && index % YIELD_EVERY_ROWS === 0) await yieldToMain();

    const row = rows[index];
    const din = normalizeDin(row[dinKey]);
    if (!din) continue;

    let qty = qtyKey ? extractNumber(row[qtyKey]) : 1;
    const { date, day } = dateKey ? parseDate(row[dateKey]) : { date: null, day: null };

    // Generate row signature for deduplication (on the raw, as-reported quantity)
    if (seenSignatures) {
      const rowSignature = buildSignature(din, qty, day, row, signature);
      if (seenSignatures.has(rowSignature)) continue;
      seenSignatures.add(rowSignature);
    }

    const existing = result.get(din) ?? { din, purchased: 0, dispensed: 0, description: undefined, transactions: [] };
    const transactionType = resolveTransactionType(row, source, typeKey);

    if (transactionType === 'purchase') {
      // Purchases arrive in packs, so the reported quantity has to be multiplied by
      // the pack size to get total units. Dispensing files already report units.
      const packSize = resolvePackSize(row, din, descKey, packSizeKey, packSizeFor);
      if (packSize > 1) qty *= packSize;
      existing.purchased += qty;
    } else {
      existing.dispensed += qty;
    }

    existing.transactions?.push({ date, quantity: qty, type: transactionType });

    // A description is only kept when it looks like a product name rather than a
    // patient name, which supplier exports sometimes place in the same column.
    if (descKey && !existing.description) {
      const desc = String(row[descKey] ?? '').trim();
      if (desc.length > 5) existing.description = desc;
    }

    result.set(din, existing);
  }

  return result;
}

/** Keeps one row per reported transaction (used by the per-row upload flow). */
async function parseIndividualRows(
  rows: ParsedRow[],
  source: 'mckesson' | 'kroll',
  seenSignatures?: Set<string>,
  packSizeFor?: PackSizeResolver
): Promise<ParsedIndividualRow[]> {
  if (rows.length === 0) return [];

  const { dinKey, qtyKey, typeKey, dateKey, descKey, packSizeKey, signature } = resolveColumns(rows, source);
  const parseDate = createDateParser();
  const result: ParsedIndividualRow[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    if (index > 0 && index % YIELD_EVERY_ROWS === 0) await yieldToMain();

    const row = rows[index];
    const din = normalizeDin(row[dinKey]);
    if (!din) continue;

    let qty = qtyKey ? extractNumber(row[qtyKey]) : 1;
    const { date, day } = dateKey ? parseDate(row[dateKey]) : { date: null, day: null };

    if (seenSignatures) {
      const rowSignature = buildSignature(din, qty, day, row, signature);
      if (seenSignatures.has(rowSignature)) continue;
      seenSignatures.add(rowSignature);
    }

    const transactionType = resolveTransactionType(row, source, typeKey);

    // Purchases arrive in packs, so the reported quantity has to be multiplied by the
    // pack size to get total units. Dispensing files already report units.
    let packSize = 1;
    if (transactionType === 'purchase') {
      packSize = resolvePackSize(row, din, descKey, packSizeKey, packSizeFor);
      if (packSize > 1) qty *= packSize;
    }

    const entry: ParsedIndividualRow = { din, quantity: qty, date, type: transactionType, packSize };
    const description = descKey ? String(row[descKey] ?? '').trim() : undefined;
    if (description && description.length > 5) entry.description = description;

    result.push(entry);
  }

  return result;
}

/** Parses one file into a DIN map plus a preview of what was found. */
export async function parseSingleFileWithPreview(
  file: File,
  source: 'mckesson' | 'kroll',
  seenSignatures?: Set<string>,
  packSizeFor?: PackSizeResolver
): Promise<{ data: Map<string, ParsedDinData>; preview: FilePreview }> {
  const parsed = await readSupplierFile(file);
  await prefetchDinReference(parsed.rows);

  const data = await aggregateRows(parsed.rows, source, seenSignatures, packSizeFor);
  return { data, preview: createFilePreview(file, parsed, data.size) };
}

/** Parses one file into individual transaction rows plus a preview of what was found. */
export async function parseSingleFileWithIndividualRows(
  file: File,
  source: 'mckesson' | 'kroll',
  seenSignatures?: Set<string>,
  packSizeFor?: PackSizeResolver
): Promise<{ data: ParsedIndividualRow[]; preview: FilePreview }> {
  const parsed = await readSupplierFile(file);
  await prefetchDinReference(parsed.rows);

  const data = await parseIndividualRows(parsed.rows, source, seenSignatures, packSizeFor);
  return { data, preview: createFilePreview(file, parsed, data.length) };
}

/** Merges the purchase and dispensing DIN maps, matching DINs across padding styles. */
export function mergeDinData(
  mckesson: Map<string, ParsedDinData>,
  kroll: Map<string, ParsedDinData>
): Map<string, { purchased: number; dispensed: number; description?: string }> {
  const allDins = new Set([...mckesson.keys(), ...kroll.keys()]);
  const merged = new Map<string, { purchased: number; dispensed: number; description?: string }>();

  for (const din of allDins) {
    let m = mckesson.get(din);
    let k = kroll.get(din);

    if (!m) {
      const matched = findMatchingDin(din, mckesson);
      if (matched) m = mckesson.get(matched);
    }
    if (!k) {
      const matched = findMatchingDin(din, kroll);
      if (matched) k = kroll.get(matched);
    }

    merged.set(din, {
      purchased: (m?.purchased ?? 0) + (k?.purchased ?? 0),
      dispensed: (m?.dispensed ?? 0) + (k?.dispensed ?? 0),
      description: m?.description ?? k?.description,
    });
  }

  return merged;
}

/**
 * Deduplicate DIN data when merging multiple file uploads.
 * Skips transactions that fall within already covered date ranges.
 */
export function deduplicateDinData(
  existingData: Map<string, ParsedDinData>,
  newData: Map<string, ParsedDinData>,
  existingDateRange: { start: Date | null; end: Date | null } | null
): Map<string, ParsedDinData> {
  const result = new Map<string, ParsedDinData>();

  for (const [din, data] of existingData) {
    result.set(din, { ...data, transactions: data.transactions ? [...data.transactions] : [] });
  }

  const rangeStart = existingDateRange?.start;
  const rangeEnd = existingDateRange?.end;

  if (!rangeStart || !rangeEnd) {
    // No date range info, can't deduplicate - just merge all
    for (const [din, data] of newData) {
      const existing = result.get(din);
      if (existing) {
        existing.purchased += data.purchased;
        existing.dispensed += data.dispensed;
        existing.transactions = [...(existing.transactions ?? []), ...(data.transactions ?? [])];
      } else {
        result.set(din, data);
      }
    }
    return result;
  }

  for (const [din, data] of newData) {
    const existing = result.get(din);
    if (!existing) {
      result.set(din, data);
      continue;
    }

    let newPurchased = 0;
    let newDispensed = 0;
    const newTransactions: ParsedDinData['transactions'] = [];

    for (const transaction of data.transactions ?? []) {
      // Skip a transaction that falls inside the date range already covered.
      if (transaction.date && transaction.date >= rangeStart && transaction.date <= rangeEnd) {
        continue;
      }
      if (transaction.type === 'purchase') newPurchased += transaction.quantity;
      else newDispensed += transaction.quantity;
      newTransactions.push(transaction);
    }

    existing.purchased += newPurchased;
    existing.dispensed += newDispensed;
    existing.transactions = [...(existing.transactions ?? []), ...newTransactions];
  }

  return result;
}
