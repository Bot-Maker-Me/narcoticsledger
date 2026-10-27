import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  ReconciliationCycle,
  ReconciliationItem,
  ReconciliationItemWithCycle,
  CycleFormData,
  ReconciliationItemDraft,
  ReconciliationFlag,
} from '@/types/reconciliation';

async function fetchCycles(): Promise<ReconciliationCycle[]> {
  const { data, error } = await supabase
    .from('reconciliation_cycles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

async function fetchCycleItems(cycleId: string): Promise<ReconciliationItem[]> {
  const { data, error } = await supabase
    .from('reconciliation_items')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('din', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function fetchAllItems(): Promise<ReconciliationItemWithCycle[]> {
  const { data, error } = await supabase
    .from('reconciliation_items')
    .select('*, reconciliation_cycles!inner(status, created_at)')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const cycle = row.reconciliation_cycles as unknown as {
      status: string;
      created_at: string;
    };
    return {
      ...row,
      cycle_status: cycle?.status as ReconciliationItemWithCycle['cycle_status'],
      cycle_created_at: cycle?.created_at ?? row.created_at,
    } as ReconciliationItemWithCycle;
  });
}

async function createCycleWithItems({
  formData,
  items,
}: {
  formData: CycleFormData;
  items: ReconciliationItemDraft[];
}): Promise<{ cycleId: string }> {
  const { data: cycleData, error: cycleError } = await supabase
    .from('reconciliation_cycles')
    .insert({
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      performed_by: formData.performed_by || null,
      verified_by: formData.verified_by || null,
      notes: formData.notes || null,
        status: 'in_progress',
      checklist: formData.checklist ?? null,
    })
    .select()
    .single();

  if (cycleError) throw cycleError;

  const cycleId = cycleData.id;

  const itemRows = items.map((item) => ({
    cycle_id: cycleId,
    din: item.din,
    drug_id: item.drug_id,
    description: item.description,
    schedule: item.schedule,
    opening_balance: item.opening_balance,
    purchased_count: item.purchased_count,
    dispensed_count: item.dispensed_count,
    actual_count: item.actual_count,
    flag: item.flag,
    verify_note: item.verify_note ?? null,
    locations: item.locations ?? [],
    suggested_adjustment:
      item.actual_count === null
        ? null
        : item.actual_count - (item.opening_balance + item.purchased_count - item.dispensed_count),
  }));

  const { error: itemsError } = await supabase
    .from('reconciliation_items')
    .insert(itemRows);

  if (itemsError) throw itemsError;

  return { cycleId };
}

async function updateActualCount({
  itemId,
  actualCount,
}: {
  itemId: string;
  actualCount: number | null;
}): Promise<ReconciliationItem> {
  const { data, error } = await supabase.rpc('update_actual_count', {
    p_item_id: itemId,
    p_actual_count: actualCount,
  });

  if (error) throw error;
  return data as ReconciliationItem;
}

async function updateOpeningBalance({
  itemId,
  openingBalance,
}: {
  itemId: string;
  openingBalance: number;
}): Promise<ReconciliationItem> {
  const { data, error } = await supabase.rpc('update_reconciliation_opening', {
    p_item_id: itemId,
    p_opening_balance: openingBalance,
  });

  if (error) throw error;
  return data as ReconciliationItem;
}

async function completeCycle({
  cycleId,
  formData,
}: {
  cycleId: string;
  formData: CycleFormData;
}): Promise<ReconciliationCycle> {
  const { data, error } = await supabase.rpc('complete_reconciliation_cycle', {
    p_cycle_id: cycleId,
    p_performed_by: formData.performed_by || null,
    p_verified_by: formData.verified_by || null,
    p_notes: formData.notes || null,
    p_start_date: formData.start_date || null,
    p_end_date: formData.end_date || null,
  });

  if (error) throw error;
  return data as ReconciliationCycle;
}

async function deleteCycle(id: string): Promise<void> {
  const { error } = await supabase.from('reconciliation_cycles').delete().eq('id', id);
  if (error) throw error;
}

export function useReconciliationCycles() {
  return useQuery({
    queryKey: ['reconciliation-cycles'],
    queryFn: fetchCycles,
  });
}

export function useReconciliationItems(cycleId: string | null) {
  return useQuery({
    queryKey: ['reconciliation-items', cycleId],
    queryFn: () => fetchCycleItems(cycleId!),
    enabled: !!cycleId,
  });
}

export function useAllReconciliationItems() {
  return useQuery({
    queryKey: ['reconciliation-items-all'],
    queryFn: fetchAllItems,
  });
}

export function useCreateCycleWithItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCycleWithItems,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-cycles'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items-all'] });
    },
  });
}

export function useUpdateActualCount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateActualCount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items-all'] });
    },
  });
}

export function useUpdateOpeningBalance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateOpeningBalance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items-all'] });
    },
  });
}

export function useCompleteCycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: completeCycle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-cycles'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items-all'] });
    },
  });
}

export function useDeleteCycle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCycle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-cycles'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-items-all'] });
    },
  });
}

export function useApplySuggestedAdjustments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (items: ReconciliationItem[]) => {
      // Disabled automatic adjustments to prevent saving previous counts
      // Users must manually apply adjustments if needed
      return 0;
    },
    onSuccess: () => {
      // No invalidation needed since we're not applying adjustments
    },
  });
}

export function computeFlag(
  actualCount: number | null,
  expected: number,
  schedule: string | null
): ReconciliationFlag {
  if (actualCount === null || actualCount === undefined) return 'Pending count';
  const variance = actualCount - expected;
  if (variance === 0) return 'OK';
  // All variances are now 'Review' since we removed schedule-based classification
  return 'Review';
}
