import type { SubscriptionStatus } from '@/types/admin';

/** Subscription status → badge styling/label shared by the admin tabs. */
export const subStatusConfig: Record<SubscriptionStatus, { style: string; label: string }> = {
  trialing: { style: 'bg-warning-50 text-warning-700', label: 'Trialing' },
  active: { style: 'bg-success-50 text-success-700', label: 'Active' },
  past_due: { style: 'bg-error-50 text-error-700', label: 'Past Due' },
  cancelled: { style: 'bg-neutral-100 text-neutral-500', label: 'Cancelled' },
  revoked: { style: 'bg-error-50 text-error-700', label: 'Revoked' },
  none: { style: 'bg-neutral-100 text-neutral-500', label: 'None' },
};
