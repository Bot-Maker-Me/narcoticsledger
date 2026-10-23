export type UserRole = 'user' | 'admin';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'revoked' | 'none';

export interface Profile {
  id: string;
  email: string | null;
  role: UserRole;
  stripe_customer_id: string | null;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  pharmacy_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  email: string | null;
  role: UserRole;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string | null;
  created_at: string;
}

export interface SystemSettings {
  id: number;
  subscription_price_cents: number;
  trial_days: number;
  updated_at: string;
}

export interface SystemHealth {
  total_users: number;
  active_subscriptions: number;
  trialing_users: number;
  active_cycles: number;
  recent_webhook_errors: number;
}

export interface AuditLog {
  id: string;
  performed_by: string | null;
  action: string;
  target_user_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  performer_email: string | null;
}

export function hasAccess(profile: Profile | null): boolean {
  if (!profile) return false;
  // Admins always have access
  if (profile.role === 'admin') return true;
  if (profile.subscription_status === 'active') return true;
  if (profile.subscription_status === 'trialing') {
    if (!profile.trial_ends_at) return true;
    return new Date(profile.trial_ends_at) > new Date();
  }
  return false;
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
