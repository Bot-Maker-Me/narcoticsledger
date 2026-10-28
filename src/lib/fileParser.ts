import Papa from 'papaparse';
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

interface ParsedRow {
  [key: string]: unknown;
}

const FILE_EXTENSIONS = ['.csv', '.xlsx', '.xls'] as const;

/** True when a file name ends in one of the supported spreadsheet extensions. */
export function isSupportedFile(file: File): boolean {
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  return (FILE_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Reads a CSV/Excel file into plain row objects.
 *
 * `xlsx` is loaded on demand: it is a large dependency that is only needed once the user
 * actually uploads a workbook, so it stays out of the initial bundle.
 */
async function readRows(file: File): Promise<ParsedRow[]> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'csv' || ext === 'txt') {
    return new Promise<ParsedRow[]>((resolve, reject) => {
      Papa.parse<ParsedRow>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (err) => reject(new Error(`Failed to parse CSV: ${err.message}`)),
      });
    });
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: '' });
  }

  throw new Error(`Unsupported file format: .${ext}. Please upload .csv or .xlsx files.`);
}

function createFilePreview(file: File, rows: ParsedRow[], uniqueDINs: number): FilePreview {
  const ext = file.name.split('.').pop()?.toLowerCase() as 'csv' | 'xlsx' | 'xls';

  return {
    fileName: file.name,
    fileSize: file.size,
    format: ext,
    totalRows: rows.length,
    uniqueDINs,
    sampleData: rows.slice(0, 5),
    detectedColumns: rows.length > 0 ? Object.keys(rows[0]) : [],
    dateRange: detectDateRange(rows),
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

/**
 * Generate a unique signature for a row to detect duplicates
 * Uses DIN, quantity, date, and optionally invoice/transaction number
 */
export function generateRowSignature(
  din: string,
  quantity: number,
  date: Date | null,
  row: ParsedRow
): string {
  const parts = [din, quantity];

  if (date) {
    parts.push(date.toISOString().split('T')[0]);
  }

  const keys = Object.keys(row);
  // Invoice-like identifiers. A dispensing export has no invoice, so the prescription
  // number is what tells two transactions apart: the same drug, quantity and day for two
  // different prescriptions were treated as one row and 70% of a Kroll dispensing export
  // was silently discarded.
  const invoiceKey = findColumnKey(keys, [
    'Invoice',
    'Invoice #',
    'Invoice Number',
    'Transaction #',
    'Transaction ID',
    'Order #',
    'Order Number',
    'Rx',
    'Rx Number',
    'Prescription #',
    'Prescription Number',
  ]);
  if (invoiceKey && row[invoiceKey]) {
    parts.push(String(row[invoiceKey]).trim());
  }

  // Product number / description: one invoice can hold several products that share a DIN
  // (e.g. a 100-pack and a 200-pack) with the same quantity. Without this they were
  // wrongly treated as duplicates and dropped.
  const productKey = findColumnKey(keys, ['Product(s) #', 'Product #', 'Product Number', 'Product ID', 'Item #', 'Item Number', 'SKU']);
  if (productKey && row[productKey]) {
    parts.push(`p${String(row[productKey]).trim()}`);
  }
  const descKey = findColumnKey(keys, ['Drug Description', 'Product Name', 'Drug Name', 'Description', 'Medication']);
  if (descKey && row[descKey]) {
    parts.push(String(row[descKey]).trim().replace(/\s+/g, ' ').toUpperCase());
  }

  // Fallback: hash of relevant row data
  if (parts.length === 2) {
    parts.push(JSON.stringify({ din, quantity, date: date?.toISOString() }));
  }

  return parts.join('|');
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

/** Date headings seen in supplier exports. "First FillDate" is deliberately absent. */
export const DATE_COLUMNS = ['Date', 'Transaction Date', 'Invoice Date', 'Order Date', 'Timestamp', 'Time', 'Day', 'FillDate', 'Fill Date'];

function detectDateRange(rows: ParsedRow[]): { start: Date | null; end: Date | null } {
  if (rows.length === 0) return { start: null, end: null };

  const dateKey = findColumnKey(Object.keys(rows[0]), DATE_COLUMNS);
  if (!dateKey) return { start: null, end: null };

  const dates: Date[] = [];
  for (const row of rows) {
    const date = extractDate(row[dateKey]);
    if (date) dates.push(date);
  }
  if (dates.length === 0) return { start: null, end: null };

  dates.sort((a, b) => a.getTime() - b.getTime());
  return { start: dates[0], end: dates[dates.length - 1] };
}

/**
 * Finds the parsed-row key that matches a candidate column name.
 *
 * Exact headings win over partial ones, and earlier candidates win over later ones.
 * Kroll's dispensing export carries both "First FillDate" and "FillDate"; a single
 * "does this key contain 'Date'?" test returned the *first* containing key, so every
 * dispensation was filed under the day the prescription was originally written
 * instead of the day it was filled.
 */
export function findColumnKey(keys: string[], candidates: string[]): string | null {
  const lowerKeys = keys.map((k) => k.toLowerCase().trim());

  for (const candidate of candidates) {
    const index = lowerKeys.indexOf(candidate.toLowerCase().trim());
    if (index !== -1) return keys[index];
  }

  for (const candidate of candidates) {
    const needle = candidate.toLowerCase().trim();
    const index = lowerKeys.findIndex((k) => k.includes(needle));
    if (index !== -1) return keys[index];
  }

  return null;
}

const DIN_COLUMNS = ['DIN', 'Drug Identification Number', 'DIN/PIN', 'drug id'];
const QTY_COLUMNS = {
  mckesson: ['Quantity', 'Qty', 'Received', 'Purchased', 'Shipped'],
  kroll: ['Quantity', 'Qty', 'Dispensed', 'Filled', 'Count'],
};
const TYPE_COLUMNS = ['Type', 'Transaction Type', 'Action', 'Direction'];
// More specific drug description column names to avoid picking up patient names
const DESCRIPTION_COLUMNS = ['Drug Description', 'Product Name', 'Drug Name', 'Description', 'Product', 'Medication'];

/**
 * Column names that explicitly carry a pack size. Deliberately strict: a generic
 * "Size" or "Package" column describes the product itself (bottle size, dose form),
 * not how many units the pharmacy received, so using it as a multiplier inflated
 * imported quantities.
 */
const PACK_SIZE_COLUMNS = ['Pack Size', 'PackSize', 'Package Size', 'Pkg Size', 'Packs'];

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
  };
}

/**
 * Resolves the server-side CDSA/DPD reference for every DIN in the file before the rows
 * are aggregated, so drug names, schedules and pack sizes are available while parsing.
 */
async function prefetchDinReference(rows: ParsedRow[]): Promise<void> {
  if (rows.length === 0) return;

  const dinKey = findColumnKey(Object.keys(rows[0]), DIN_COLUMNS);
  if (!dinKey) return;

  try {
    await fetchReferenceEntries(rows.map((row) => String(row[dinKey] ?? '')));
  } catch (error) {
    console.error('[file-parser] DIN reference lookup failed:', error);
  }
}

/** Aggregates a file's rows into one entry per DIN (used by reconciliation imports). */
function aggregateRows(
  rows: ParsedRow[],
  source: 'mckesson' | 'kroll',
  seenSignatures?: Set<string>,
  packSizeFor?: PackSizeResolver
): Map<string, ParsedDinData> {
  if (rows.length === 0) return new Map();

  const { dinKey, qtyKey, typeKey, dateKey, descKey, packSizeKey } = resolveColumns(rows, source);
  const result = new Map<string, ParsedDinData>();

  for (const row of rows) {
    const din = normalizeDin(row[dinKey]);
    if (!din) continue;

    const existing = result.get(din) ?? { din, purchased: 0, dispensed: 0, description: undefined, transactions: [] };

    let qty = qtyKey ? extractNumber(row[qtyKey]) : 1;
    const date = dateKey ? extractDate(row[dateKey]) : null;

    // Generate row signature for deduplication (on the raw, as-reported quantity)
    if (seenSignatures) {
      const signature = generateRowSignature(din, qty, date, row);
      if (seenSignatures.has(signature)) continue;
      seenSignatures.add(signature);
    }

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
function parseIndividualRows(
  rows: ParsedRow[],
  source: 'mckesson' | 'kroll',
  seenSignatures?: Set<string>,
  packSizeFor?: PackSizeResolver
): ParsedIndividualRow[] {
  if (rows.length === 0) return [];

  const { dinKey, qtyKey, typeKey, dateKey, descKey, packSizeKey } = resolveColumns(rows, source);
  const result: ParsedIndividualRow[] = [];

  for (const row of rows) {
    const din = normalizeDin(row[dinKey]);
    if (!din) continue;

    let qty = qtyKey ? extractNumber(row[qtyKey]) : 1;
    const date = dateKey ? extractDate(row[dateKey]) : null;

    if (seenSignatures) {
      const signature = generateRowSignature(din, qty, date, row);
      if (seenSignatures.has(signature)) continue;
      seenSignatures.add(signature);
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
  const rows = await readRows(file);
  await prefetchDinReference(rows);

  const data = aggregateRows(rows, source, seenSignatures, packSizeFor);
  return { data, preview: createFilePreview(file, rows, data.size) };
}

/** Parses one file into individual transaction rows plus a preview of what was found. */
export async function parseSingleFileWithIndividualRows(
  file: File,
  source: 'mckesson' | 'kroll',
  seenSignatures?: Set<string>,
  packSizeFor?: PackSizeResolver
): Promise<{ data: ParsedIndividualRow[]; preview: FilePreview }> {
  const rows = await readRows(file);
  await prefetchDinReference(rows);

  const data = parseIndividualRows(rows, source, seenSignatures, packSizeFor);
  return { data, preview: createFilePreview(file, rows, data.length) };
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
