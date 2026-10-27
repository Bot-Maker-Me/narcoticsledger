import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { stockLevelsQuery } from '@/lib/stockLevels';
import type { Drug, DrugFormData, DrugWithStock } from '@/types/drug';

const DRUG_COLUMNS = 'id, user_id, din, description, schedule, pack_size, reorder_level, created_at';

async function fetchDrugs(queryClient: QueryClient): Promise<DrugWithStock[]> {
  const { data, error } = await supabase
    .from('drugs')
    .select(DRUG_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const stockMap = await queryClient.fetchQuery(stockLevelsQuery);

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

async function updatePackSize({ id, packSize }: { id: string; packSize: number }): Promise<void> {
  const { error } = await supabase.from('drugs').update({ pack_size: packSize }).eq('id', id);
  if (error) throw error;
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
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['drugs'],
    queryFn: () => fetchDrugs(queryClient),
  });
}

/** Invalidates the drug list, which also refreshes the nested stock query. */
function useDrugMutation<TVariables, TData>(mutationFn: (variables: TVariables) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['drugs'] }),
  });
}

export function useCreateDrug() {
  return useDrugMutation(createDrug);
}

export function useUpdateDrug() {
  return useDrugMutation(updateDrug);
}

export function useUpdatePackSize() {
  return useDrugMutation(updatePackSize);
}

export function useDeleteDrug() {
  return useDrugMutation(deleteDrug);
}

export function useCheckDinUnique() {
  return useMutation({
    mutationFn: ({ din, excludeId }: { din: string; excludeId?: string }) =>
      checkDinUnique(din, excludeId),
  });
}
