import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/errors';
import type {
  AdminUser,
  SystemSettings,
  SystemHealth,
  AuditLog,
  SubscriptionStatus,
} from '@/types/admin';

/**
 * Admin and billing data hooks.
 *
 * Every privileged read and write goes through a SECURITY DEFINER RPC that re-checks the
 * caller's admin role in the database. The previous version queried a `users` table that
 * does not exist and wrote to `system_settings` directly over the API (which RLS blocks),
 * so the whole admin panel silently reported zeros and fake success.
 */

const AUDIT_LOG_LIMIT = 50;

async function fetchSystemSettings(): Promise<SystemSettings> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('id, subscription_price_cents, trial_days, updated_at')
    .eq('id', 1)
    .single();

  if (error) throw error;
  return data;
}

async function fetchAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error) throw error;

  return (data ?? []).map((user) => ({
    id: user.id,
    email: user.email,
    role: user.role,
    subscription_status: (user.subscription_status ?? 'none') as SubscriptionStatus,
    trial_ends_at: user.trial_ends_at,
    created_at: user.created_at,
  }));
}

async function fetchSystemHealth(): Promise<SystemHealth> {
  const { data, error } = await supabase.rpc('admin_system_health');
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      total_users: 0,
      active_subscriptions: 0,
      trialing_users: 0,
      active_cycles: 0,
      recent_webhook_errors: 0,
    };
  }

  return {
    total_users: Number(row.total_users ?? 0),
    active_subscriptions: Number(row.active_subscriptions ?? 0),
    trialing_users: Number(row.trialing_users ?? 0),
    active_cycles: Number(row.active_cycles ?? 0),
    recent_webhook_errors: Number(row.recent_webhook_errors ?? 0),
  };
}

async function fetchAuditLogs(): Promise<AuditLog[]> {
  const { data, error } = await supabase.rpc('admin_list_audit_logs', {
    p_limit: AUDIT_LOG_LIMIT,
  });

  if (error) throw error;
  return (data ?? []) as AuditLog[];
}

async function extendTrial(userId: string, days: number): Promise<void> {
  const { error } = await supabase.rpc('admin_extend_trial', {
    p_user_id: userId,
    p_days: days,
  });
  if (error) throw error;
}

async function activateSubscription(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_activate_subscription', { p_user_id: userId });
  if (error) throw error;
}

async function revokeAccess(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_revoke_access', { p_user_id: userId });
  if (error) throw error;
}

async function updatePricing(priceCents: number, trialDays: number): Promise<void> {
  const { error } = await supabase.rpc('admin_update_pricing', {
    p_price_cents: priceCents,
    p_trial_days: trialDays,
  });
  if (error) throw error;
}

/**
 * Starts a Stripe Checkout session. The price is chosen by the server from
 * `system_settings`; nothing about the amount is sent from the browser.
 */
async function createCheckoutSession(): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: {} });
  if (error) throw error;

  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new Error('Stripe did not return a checkout URL');
  return { url };
}

/** Opens the Stripe billing portal so a subscriber can cancel or change their card. */
async function createBillingPortalSession(): Promise<{ url: string }> {
  const { data, error } = await supabase.functions.invoke('stripe-portal', { body: {} });
  if (error) throw error;

  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new Error('Stripe did not return a billing portal URL');
  return { url };
}

export function useSystemSettings() {
  return useQuery({
    queryKey: ['system-settings'],
    queryFn: fetchSystemSettings,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: fetchAdminUsers,
  });
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ['system-health'],
    queryFn: fetchSystemHealth,
    refetchInterval: 30000,
  });
}

export function useAuditLogs() {
  return useQuery({
    queryKey: ['audit-logs'],
    queryFn: fetchAuditLogs,
  });
}

/** Shared invalidation for the admin mutations, which all keep an audit trail. */
function useAdminMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['system-health'] });
    },
    onError: (error) => reportError(error, { scope: 'admin-mutation' }),
  });
}

export function useExtendTrial() {
  return useAdminMutation(({ userId, days }: { userId: string; days: number }) =>
    extendTrial(userId, days)
  );
}

export function useActivateSubscription() {
  return useAdminMutation((userId: string) => activateSubscription(userId));
}

export function useRevokeAccess() {
  return useAdminMutation((userId: string) => revokeAccess(userId));
}

export function useUpdatePricing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ priceCents, trialDays }: { priceCents: number; trialDays: number }) =>
      updatePricing(priceCents, trialDays),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
    },
  });
}

export function useCreateCheckoutSession() {
  return useMutation({ mutationFn: createCheckoutSession });
}

export function useCreateBillingPortalSession() {
  return useMutation({ mutationFn: createBillingPortalSession });
}
