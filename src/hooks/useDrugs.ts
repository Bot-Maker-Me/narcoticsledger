import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchStockByDrugId } from '@/lib/stockLevels';
import type { Drug, DrugFormData, DrugWithStock } from '@/types/drug';

async function fetchDrugs(): Promise<DrugWithStock[]> {
  const { data, error } = await supabase
    .from('drugs')
    .select('id, user_id, din, description, schedule, pack_size, reorder_level, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;

  let stockMap = new Map<string, number>();
  try {
    stockMap = await fetchStockByDrugId();
  } catch (err) {
    console.error('Failed to fetch stock levels:', err);
    stockMap = new Map();
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    din: row.din,
    description: row.description,
    schedule: row.schedule,
    pack_size: row.pack_size,
    reorder_level: row.reorder_level,
    created_at: row.created_at,
    current_stock: stockMap.get(row.id) ?? 0,
  }));
}

async function createDrug(formData: DrugFormData): Promise<Drug> {
  const { data, error } = await supabase
    .from('drugs')
    .insert({
      din: formData.din,
      description: formData.description.trim(),
      schedule: formData.schedule,
      pack_size: formData.pack_size,
      reorder_level: formData.reorder_level,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateDrug({ id, formData }: { id: string; formData: DrugFormData }): Promise<Drug> {
  const { data, error } = await supabase
    .from('drugs')
    .update(formData)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteDrug(id: string): Promise<void> {
  const { error } = await supabase.from('drugs').delete().eq('id', id);
  if (error) throw error;
}

async function checkDinUnique(din: string, excludeId?: string): Promise<boolean> {
  let query = supabase.from('drugs').select('id').eq('din', din).limit(1);
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  if (error) throw error;
  return !data || data.length === 0;
}

export function useDrugs() {
  return useQuery({
    queryKey: ['drugs'],
    queryFn: fetchDrugs,
  });
}

export function useCreateDrug() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDrug,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
    },
  });
}

export function useUpdateDrug() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateDrug,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
    },
  });
}

export function useDeleteDrug() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteDrug,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
    },
  });
}

export function useCheckDinUnique() {
  return useMutation({
    mutationFn: ({ din, excludeId }: { din: string; excludeId?: string }) =>
      checkDinUnique(din, excludeId),
  });
}
