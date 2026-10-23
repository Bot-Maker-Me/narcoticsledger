import { supabase } from '@/lib/supabase';

export async function fetchStockByDrugId(): Promise<Map<string, number>> {
  try {
    const { data, error } = await supabase
      .from('drug_stock_levels')
      .select('drug_id, current_stock');

    if (error) throw error;

    const map = new Map<string, number>();
    for (const row of data ?? []) {
      map.set(row.drug_id as string, Number(row.current_stock ?? 0));
    }
    return map;
  } catch (error) {
    console.error('Failed to fetch stock levels:', error);
    // Return empty map if view doesn't exist or there's an error
    return new Map();
  }
}
