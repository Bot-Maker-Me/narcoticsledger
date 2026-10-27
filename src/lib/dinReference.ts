import * as XLSX from 'xlsx';
import type { DrugSchedule } from '@/types/drug';

export interface DinReferenceEntry {
  din: string;
  /** Product / brand name, e.g. "AA-METHYLPHENIDATE SR". */
  description?: string;
  strength?: string;
  dosageForm?: string;
  route?: string;
  ingredient?: string;
  manufacturer?: string;
  /** Raw CDSA schedule text from the reference, e.g. "CONTROLLED DRUGS (CDSA III)". */
  scheduleLabel?: string;
  /** The raw schedule mapped onto the app's schedule values. */
  schedule?: DrugSchedule;
  /** Units per pack. 0 when the reference does not carry pack sizes. */
  packSize: number;
}

/**
 * CDSA / DPD product reference shipped with the app (public/CDSA_Drugs_DPD.xlsx).
 *
 * Every imported supplier file (purchase / dispense) and every manual entry is run
 * through this reference so the DIN is identified and converted to total units:
 * the recorded quantity is multiplied by the product's pack size when the reference
 * provides one.
 *
 * DINs that do not match exactly are retried with leading zeros added (and removed),
 * because supplier exports often drop the leading zeros of an 8 digit DIN.
 */
const REFERENCE_FILE_URL = '/CDSA_Drugs_DPD.xlsx';

const DIN_COLUMNS = ['DIN', 'Drug Identification Number', 'DIN/PIN', 'DIN Number', 'Drug ID'];
const PACK_SIZE_COLUMNS = [
  'Pack Size',
  'Package Size',
  'Pkg Size',
  'PackSize',
  'Units per Pack',
  'Unit per Pack',
  'Quantity per Pack',
  'Pack Qty',
  'Pack',
  'Package',
  'Size',
  'Qty',
];
const DESCRIPTION_COLUMNS = ['Drug Name', 'Brand Name', 'Brand', 'Product Name', 'Drug Description', 'Description', 'Product', 'Name'];
const STRENGTH_COLUMNS = ['Strength', 'Strength/Dosage', 'Dosage Strength'];
const FORM_COLUMNS = ['Dosage Form', 'Form'];
const ROUTE_COLUMNS = ['Route', 'Route of Administration'];
const INGREDIENT_COLUMNS = ['Active Ingredient(s)', 'Active Ingredient', 'Ingredient'];
const MANUFACTURER_COLUMNS = ['Manufacturer', 'Company Name', 'Company', 'Supplier'];
const SCHEDULE_COLUMNS = ['CDSA Schedule', 'Schedule', 'Product Category', 'Category'];

let entries: Map<string, DinReferenceEntry> | null = null;
let loading: Promise<Map<string, DinReferenceEntry>> | null = null;

/** Digits only, padded to 8 characters (the DPD/supplier DIN format). */
export function normalizeDin(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(8, '0');
}

function textValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function numberFromValue(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : 0;
  const text = String(value ?? '').replace(/,/g, '').trim();
  const match = text.match(/\d+(\.\d+)?/);
  if (!match) return 0;
  return Math.round(parseFloat(match[0]));
}

/** Maps CDSA schedule text (e.g. "CONTROLLED DRUGS (CDSA III)") onto app values. */
export function mapCdsaSchedule(label?: string): DrugSchedule | undefined {
  if (!label) return undefined;
  const text = label.toUpperCase();
  if (text.includes('NARCOTIC')) return 'Narcotic';
  if (text.includes('CONTROLLED')) return 'Controlled';
  if (text.includes('TARGETED') || text.includes('BENZODIAZEPINE') || text.includes('ANABOLIC') || text.includes('PRECURSOR')) {
    return 'Targeted';
  }
  return undefined;
}

/** "NAME STRENGTH" label used when a drug has no description yet. */
export function referenceLabel(entry: DinReferenceEntry): string {
  return [entry.description, entry.strength].filter(Boolean).join(' ').trim();
}

/** Picks the column with the strongest values, preferring exact header matches. */
function selectColumn(
  headers: string[],
  rows: Array<Record<string, unknown>>,
  candidates: string[],
  valueScore: (value: unknown) => number
): string | null {
  const lowerCandidates = candidates.map((c) => c.toLowerCase());
  let best: { key: string; score: number; rank: number } | null = null;

  for (const key of headers) {
    const lower = key.toLowerCase().trim();
    const exact = lowerCandidates.indexOf(lower);
    const partial = exact === -1 ? lowerCandidates.findIndex((c) => lower.includes(c)) : -1;
    if (exact === -1 && partial === -1) continue;

    const rank = exact !== -1 ? exact : partial + candidates.length;
    let score = 0;
    for (const row of rows.slice(0, 50)) {
      score += valueScore(row[key]);
    }
    if (score <= 0) continue;

    if (!best || score > best.score || (score === best.score && rank < best.rank)) {
      best = { key, score, rank };
    }
  }

  return best?.key ?? null;
}

const dinValueScore = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '');
  return /^\d{6,10}$/.test(digits) ? 1 : 0;
};

const textValueScore = (value: unknown) => (textValue(value) ? 1 : 0);

const packSizeValueScore = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value > 0 ? 1 : 0;
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return parseFloat(text) > 0 ? 1 : 0;
  // Values such as "100 TAB" are still usable but rank below plain numbers.
  return numberFromValue(text) > 0 ? 0.5 : 0;
};

const REFERENCE_TIMEOUT_MS = 15000;

async function downloadReference(url: string): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFERENCE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Could not load ${url} (HTTP ${response.status})`);
    }
    return await response.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

async function buildIndex(): Promise<Map<string, DinReferenceEntry>> {
  console.log(`[din-reference] loading ${REFERENCE_FILE_URL}`);
  const buffer = await downloadReference(REFERENCE_FILE_URL);
  console.log(`[din-reference] downloaded ${buffer.byteLength} bytes`);

  const workbook = XLSX.read(buffer, { type: 'array' });
  const map = new Map<string, DinReferenceEntry>();

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
    if (rows.length === 0) continue;

    const headers = Object.keys(rows[0]);
    const dinKey = selectColumn(headers, rows, DIN_COLUMNS, dinValueScore);
    // Pack sizes are optional: the CDSA/DPD extract has none, a supplier price file does.
    const packKey = selectColumn(headers, rows, PACK_SIZE_COLUMNS, packSizeValueScore);

    console.log(`[din-reference] sheet "${sheetName}" headers:`, headers);
    console.log(`[din-reference] sheet "${sheetName}" using DIN column "${dinKey}" and pack size column "${packKey}"`);

    if (!dinKey) {
      console.warn(`[din-reference] sheet "${sheetName}" skipped: no DIN column found`);
      continue;
    }

    const descKey = selectColumn(headers, rows, DESCRIPTION_COLUMNS, textValueScore);
    const strengthKey = selectColumn(headers, rows, STRENGTH_COLUMNS, textValueScore);
    const formKey = selectColumn(headers, rows, FORM_COLUMNS, textValueScore);
    const routeKey = selectColumn(headers, rows, ROUTE_COLUMNS, textValueScore);
    const ingredientKey = selectColumn(headers, rows, INGREDIENT_COLUMNS, textValueScore);
    const manufacturerKey = selectColumn(headers, rows, MANUFACTURER_COLUMNS, textValueScore);
    const scheduleKey = selectColumn(headers, rows, SCHEDULE_COLUMNS, textValueScore);

    let added = 0;
    let withPackSize = 0;

    for (const row of rows) {
      const din = normalizeDin(row[dinKey]);
      if (!din) continue;
      if (map.has(din)) continue;

      const packSize = packKey ? numberFromValue(row[packKey]) : 0;
      if (packSize > 0) withPackSize += 1;

      const scheduleLabel = scheduleKey ? textValue(row[scheduleKey]) : undefined;

      map.set(din, {
        din,
        description: descKey ? textValue(row[descKey]) : undefined,
        strength: strengthKey ? textValue(row[strengthKey]) : undefined,
        dosageForm: formKey ? textValue(row[formKey]) : undefined,
        route: routeKey ? textValue(row[routeKey]) : undefined,
        ingredient: ingredientKey ? textValue(row[ingredientKey]) : undefined,
        manufacturer: manufacturerKey ? textValue(row[manufacturerKey]) : undefined,
        scheduleLabel,
        schedule: mapCdsaSchedule(scheduleLabel),
        packSize,
      });
      added += 1;
    }

    console.log(`[din-reference] sheet "${sheetName}": ${added} DINs indexed, ${withPackSize} with a pack size`);
  }

  console.log(`[din-reference] reference ready: ${map.size} DINs from ${REFERENCE_FILE_URL}`);
  return map;
}

/** Loads the reference once and caches it (a failed load is retried on the next call). */
export function loadDinReference(): Promise<Map<string, DinReferenceEntry>> {
  if (entries) return Promise.resolve(entries);
  if (!loading) {
    console.log('[din-reference] starting load');
    loading = buildIndex()
      .then((map) => {
        entries = map;
        return map;
      })
      .catch((error) => {
        console.error('[din-reference] failed to load reference:', error);
        throw error;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

export function isDinReferenceReady(): boolean {
  return entries !== null;
}

/** Loads the reference, resolving to false instead of throwing when it is unavailable. */
export async function ensureDinReference(): Promise<boolean> {
  try {
    await loadDinReference();
    return true;
  } catch {
    return false;
  }
}

export function getDinReferenceSize(): number {
  return entries?.size ?? 0;
}

/** How many reference rows carry a usable pack size. */
export function getDinReferencePackSizeCount(): number {
  if (!entries) return 0;
  let count = 0;
  for (const entry of entries.values()) {
    if (entry.packSize > 0) count += 1;
  }
  return count;
}

/**
 * Looks up a DIN, retrying with leading zeros added (and removed) when the exact
 * value is not present.
 */
export function getDinReferenceEntry(rawDin: string): DinReferenceEntry | null {
  if (!entries) return null;

  const digits = String(rawDin ?? '').replace(/\D/g, '');
  if (!digits) return null;

  const candidates: string[] = [digits];
  for (let length = digits.length + 1; length <= 8; length += 1) {
    candidates.push(digits.padStart(length, '0'));
  }
  candidates.push(digits.padStart(8, '0'));

  const trimmed = digits.replace(/^0+/, '');
  if (trimmed && trimmed !== digits) {
    candidates.push(trimmed, trimmed.padStart(8, '0'));
  }

  for (const candidate of candidates) {
    const match = entries.get(candidate);
    if (match) return match;
  }

  return null;
}

/** Pack size for a DIN, or null when the reference has no pack size for it. */
export function getReferencePackSize(rawDin: string): number | null {
  const entry = getDinReferenceEntry(rawDin);
  return entry && entry.packSize > 0 ? entry.packSize : null;
}

/**
 * Resolves the pack size used to convert entered quantities into total units: the
 * CDSA/DPD reference first, then the pack size stored on the drug record. Returns
 * null when neither provides a pack size greater than 1, so callers can fall back to
 * a pack size found inside the uploaded file.
 */
export function createPackSizeResolver(
  drugs: Array<{ din: string; pack_size: number }> = []
): (din: string) => number | null {
  const drugPackSizes = new Map<string, number>();
  for (const drug of drugs) {
    const key = normalizeDin(drug.din);
    if (key && drug.pack_size > 1) drugPackSizes.set(key, drug.pack_size);
  }

  return (din: string) => {
    const reference = getReferencePackSize(din);
    if (reference) return reference;
    const key = normalizeDin(din);
    if (!key) return null;
    return drugPackSizes.get(key) ?? null;
  };
}
