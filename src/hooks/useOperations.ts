import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  Incident,
  MedChange,
  PolicyAck,
  PolicyDoc,
  ProductionBatch,
  TimePunch,
} from '@/types/operations';

function useOwnedList<T>(table: string, key: string) {
  return useQuery({
    queryKey: [key],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

export function usePolicies() {
  return useOwnedList<PolicyDoc>('policies', 'policies');
}

export function usePolicyAcks() {
  return useOwnedList<PolicyAck>('policy_acknowledgements', 'policy-acks');
}

export function useSavePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; title: string; body: string; version: string }) => {
      if (input.id) {
        const { error } = await supabase
          .from('policies')
          .update({ title: input.title, body: input.body, version: input.version, updated_at: new Date().toISOString() })
          .eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('policies').insert({
          title: input.title,
          body: input.body,
          version: input.version,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies'] }),
  });
}

export function useDeletePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('policies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies'] }),
  });
}

export function useAcknowledgePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { policy_id: string; staff_name: string }) => {
      const { error } = await supabase.from('policy_acknowledgements').insert(input);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policy-acks'] }),
  });
}

export function useIncidents() {
  return useOwnedList<Incident>('incidents', 'incidents');
}

export function useSaveIncident() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Incident> & { title: string }) => {
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await supabase.from('incidents').update(rest).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('incidents').insert(input);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incidents'] }),
  });
}

export function useTimePunches() {
  return useOwnedList<TimePunch>('time_punches', 'time-punches');
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (staff_name: string) => {
      const { error } = await supabase.from('time_punches').insert({ staff_name });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time-punches'] }),
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('time_punches')
        .update({ clock_out: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time-punches'] }),
  });
}

export function useProductionBatches() {
  return useOwnedList<ProductionBatch>('production_batches', 'production-batches');
}

export function useSaveBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ProductionBatch> & { product_name: string; quantity: number }) => {
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await supabase.from('production_batches').update(rest).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('production_batches').insert(input);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['production-batches'] }),
  });
}

export function useMedChanges() {
  return useOwnedList<MedChange>('med_changes', 'med-changes');
}

export function useSaveMedChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<MedChange> & { patient_name: string; drug_from: string; drug_to: string }) => {
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await supabase.from('med_changes').update(rest).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('med_changes').insert(input);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['med-changes'] }),
  });
}
