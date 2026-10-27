import { supabase } from '@/lib/supabase';
import { dinCandidates, digitsOf, normalizeDin } from '@/lib/din';
import type { DrugSchedule } from '@/types/drug';

/**
 * CDSA / DPD product reference.
 *
 * The reference itself lives server-side in the `din-reference` edge function, so the
 * data is never shipped to the browser. Every imported supplier file (purchase /
 * dispense) and every manual entry is matched against it so the DIN is identified and
 * given its CDSA schedule.
 *
 * DIN normalisation and matching live in `@/lib/din`; this module is only the reference
 * lookup service.
 */
export interface DinReferenceEntry {
  din: string;
  /** Product / brand name, e.g. "AA-METHYLPHENIDATE SR". */
  description?: string;
  strength?: string;
  /** The reference schedule mapped onto the app's schedule values. */
  schedule?: DrugSchedule;
}

/** Entries resolved this session; null means "the reference does not know this DIN". */
const cache = new Map<string, DinReferenceEntry | null>();

/** Maps CDSA schedule text (e.g. "CONTROLLED DRUGS (CDSA III)") onto app values. */
function mapCdsaSchedule(label?: string): DrugSchedule | undefined {
  if (!label) return undefined;
  const text = label.toUpperCase();
  if (text.includes('NARCOTIC')) return 'Narcotic';
  if (text.includes('CONTROLLED')) return 'Controlled';
  if (
    text.includes('TARGETED') ||
    text.includes('BENZODIAZEPINE') ||
    text.includes('ANABOLIC') ||
    text.includes('PRECURSOR')
  ) {
    return 'Targeted';
  }
  return undefined;
}

/** "NAME STRENGTH" label used when a drug has no description yet. */
export function referenceLabel(entry: DinReferenceEntry): string {
  return [entry.description, entry.strength].filter(Boolean).join(' ').trim();
}

/**
 * Looks a DIN up in the entries resolved so far, retrying with leading zeros added
 * (and removed) when the exact value is not present.
 */
export function getDinReferenceEntry(rawDin: string): DinReferenceEntry | null {
  for (const candidate of dinCandidates(digitsOf(rawDin))) {
    const match = cache.get(candidate);
    if (match) return match;
  }
  return null;
}

/**
 * Resolves reference entries for the given DINs from the `din-reference` edge function
 * and caches them (including misses) so later lookups stay synchronous.
 */
export async function fetchReferenceEntries(dins: Array<string | null | undefined>): Promise<void> {
  const requested = new Set<string>();
  for (const raw of dins) {
    const key = normalizeDin(raw);
    if (!key || cache.has(key)) continue;
    requested.add(key);
  }
  if (requested.size === 0) return;

  const keys = [...requested];
  const { data, error } = await supabase.functions.invoke('din-reference', {
    body: { dins: keys },
  });

  if (error) {
    console.error('[din-reference] lookup failed:', error.message);
    return;
  }

  const rows = (data?.entries ?? []) as Array<{
    din?: string;
    description?: string;
    strength?: string;
    schedule?: string;
  }>;

  for (const row of rows) {
    const key = normalizeDin(row.din);
    if (!key) continue;
    cache.set(key, {
      din: key,
      description: row.description || undefined,
      strength: row.strength || undefined,
      schedule: mapCdsaSchedule(row.schedule),
    });
  }

  // Remember the DINs the reference does not know so they are not requested again.
  for (const key of keys) {
    if (!cache.has(key)) cache.set(key, getDinReferenceEntry(key));
  }
}

/**
 * Resolves the pack size used to convert entered quantities into total units: the pack
 * size stored on the drug record. Returns null when the drug has no pack size above 1,
 * so callers can fall back to a pack size found inside the uploaded file.
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
    const key = normalizeDin(din);
    if (!key) return null;
    return drugPackSizes.get(key) ?? null;
  };
}
