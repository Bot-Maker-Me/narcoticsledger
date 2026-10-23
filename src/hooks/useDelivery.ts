import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { geocodeAddress, optimizeStopOrder, sleep } from '@/lib/routeOptimize';
import type {
  DeliveryAuditEntry,
  DeliveryRun,
  DeliveryStop,
  PharmacyTeam,
} from '@/types/operations';

async function logAudit(runId: string | null, stopId: string | null, action: string, details?: Record<string, unknown>) {
  await supabase.from('delivery_audit_log').insert({
    run_id: runId,
    stop_id: stopId,
    action,
    details: details ?? null,
  });
}

export function usePharmacyTeams() {
  return useQuery({
    queryKey: ['pharmacy-teams'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pharmacy_teams').select('*').order('created_at');
      if (error) throw error;
      return (data ?? []) as PharmacyTeam[];
    },
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; store_name?: string }) => {
      const { data, error } = await supabase.from('pharmacy_teams').insert(input).select().single();
      if (error) throw error;
      return data as PharmacyTeam;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pharmacy-teams'] }),
  });
}

export function useDeliveryRuns() {
  return useQuery({
    queryKey: ['delivery-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_runs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DeliveryRun[];
    },
  });
}

export function useDeliveryStops(runId: string | null) {
  return useQuery({
    queryKey: ['delivery-stops', runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_stops')
        .select('*')
        .eq('run_id', runId!)
        .order('sequence');
      if (error) throw error;
      return (data ?? []) as DeliveryStop[];
    },
    enabled: !!runId,
  });
}

export function useDeliveryAudit(runId: string | null) {
  return useQuery({
    queryKey: ['delivery-audit', runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_audit_log')
        .select('*')
        .eq('run_id', runId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DeliveryAuditEntry[];
    },
    enabled: !!runId,
  });
}

export function useCreateDeliveryRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; team_id?: string | null; notes?: string }) => {
      const { data, error } = await supabase
        .from('delivery_runs')
        .insert({ name: input.name, team_id: input.team_id ?? null, notes: input.notes ?? null })
        .select()
        .single();
      if (error) throw error;
      await logAudit(data.id, null, 'run_created', { name: input.name });
      return data as DeliveryRun;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery-runs'] }),
  });
}

export function useUpdateDeliveryRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<DeliveryRun> }) => {
      const { data, error } = await supabase.from('delivery_runs').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data as DeliveryRun;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery-runs'] }),
  });
}

export function useDeleteDeliveryRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('delivery_runs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery-runs'] }),
  });
}

export function useAddDeliveryStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<DeliveryStop, 'id' | 'user_id' | 'created_at' | 'lat' | 'lng'> & { lat?: number | null; lng?: number | null }) => {
      const query = [input.address, input.city, input.postal_code].filter(Boolean).join(', ');
      const geo = await geocodeAddress(query);
      const { data, error } = await supabase
        .from('delivery_stops')
        .insert({
          ...input,
          lat: geo?.lat ?? input.lat ?? null,
          lng: geo?.lng ?? input.lng ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      await logAudit(input.run_id, data.id, 'stop_added', { patient: input.patient_name });
      return data as DeliveryStop;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['delivery-stops', vars.run_id] });
      qc.invalidateQueries({ queryKey: ['delivery-audit', vars.run_id] });
    },
  });
}

export function useUpdateDeliveryStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      runId,
      patch,
      action,
    }: {
      id: string;
      runId: string;
      patch: Partial<DeliveryStop>;
      action?: string;
    }) => {
      const { data, error } = await supabase.from('delivery_stops').update(patch).eq('id', id).select().single();
      if (error) throw error;
      if (action) await logAudit(runId, id, action, patch as Record<string, unknown>);
      return data as DeliveryStop;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['delivery-stops', vars.runId] });
      qc.invalidateQueries({ queryKey: ['delivery-audit', vars.runId] });
      qc.invalidateQueries({ queryKey: ['delivery-runs'] });
    },
  });
}

export function useDeleteDeliveryStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, runId }: { id: string; runId: string }) => {
      const { error } = await supabase.from('delivery_stops').delete().eq('id', id);
      if (error) throw error;
      await logAudit(runId, id, 'stop_removed');
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['delivery-stops', vars.runId] });
      qc.invalidateQueries({ queryKey: ['delivery-audit', vars.runId] });
    },
  });
}

export function useOptimizeRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ runId, stops }: { runId: string; stops: DeliveryStop[] }) => {
      const missing = stops.filter((s) => s.lat == null || s.lng == null);
      for (const stop of missing) {
        const q = [stop.address, stop.city, stop.postal_code].filter(Boolean).join(', ');
        const geo = await geocodeAddress(q);
        if (geo) {
          await supabase.from('delivery_stops').update({ lat: geo.lat, lng: geo.lng }).eq('id', stop.id);
        }
        await sleep(1100);
      }
      const { data: refreshed, error: fetchErr } = await supabase
        .from('delivery_stops')
        .select('*')
        .eq('run_id', runId)
        .order('sequence');
      if (fetchErr) throw fetchErr;
      const ordered = optimizeStopOrder((refreshed ?? []) as DeliveryStop[]);
      for (const stop of ordered) {
        const { error } = await supabase
          .from('delivery_stops')
          .update({ sequence: stop.sequence })
          .eq('id', stop.id);
        if (error) throw error;
      }
      await supabase.from('delivery_runs').update({ status: 'optimized' }).eq('id', runId);
      await logAudit(runId, null, 'route_optimized', { stops: ordered.length });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['delivery-stops', vars.runId] });
      qc.invalidateQueries({ queryKey: ['delivery-runs'] });
      qc.invalidateQueries({ queryKey: ['delivery-audit', vars.runId] });
    },
  });
}
