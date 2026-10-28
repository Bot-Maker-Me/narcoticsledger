import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/errors';

/**
 * React Query options for the per-drug stock map.
 *
 * The key is nested under `['drugs']` on purpose: every existing
 * `invalidateQueries({ queryKey: ['drugs'] })` also refreshes the stock, so no mutation
 * had to change. Both `useDrugs` and `usePrescriptions` read the same entry, which
 * removes the duplicate request the two hooks used to make on every page load.
 */
export const stockLevelsQuery = {
  queryKey: ['drugs', 'stock'] as const,
  queryFn: fetchStockByDrugId,
  staleTime: 30_000,
};

export async function fetchStockByDrugId(): Promise<Map<string, number>> {
  try {
    const { data, error } = await supabase.from('drug_stock_levels').select('id, current_stock');

    if (error) throw error;

    const map = new Map<string, number>();
    for (const row of data ?? []) {
      map.set(row.id as string, Number(row.current_stock ?? 0));
    }
    return map;
  } catch (error) {
    reportError(error, { scope: 'stock-levels' });
    // The view may not exist in a fresh environment; treat stock as unknown rather than
    // failing the whole drugs query.
    return new Map();
  }
}
