import type { Profile } from '@/types/admin';

/**
 * Whether a signed-in profile may use the app.
 *
 * Admins always have access; otherwise an active subscription grants access and a trial
 * grants access until `trial_ends_at` passes. Used by the router guard and the paywall.
 */
export function hasAccess(profile: Profile | null): boolean {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  if (profile.subscription_status === 'active') return true;
  if (profile.subscription_status === 'trialing') {
    if (!profile.trial_ends_at) return true;
    return new Date(profile.trial_ends_at) > new Date();
  }
  return false;
}
