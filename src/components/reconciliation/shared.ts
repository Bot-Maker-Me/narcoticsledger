import type { ReconciliationFlag } from '@/types/reconciliation';

/** Shared flag → colour mapping used by the draft and saved reconciliation tables. */
export const flagStyles: Record<ReconciliationFlag, string> = {
  OK: 'bg-success-50 text-success-700',
  'Pending count': 'bg-neutral-100 text-neutral-500',
  Review: 'bg-warning-50 text-warning-700',
  Verify: 'bg-error-50 text-error-700',
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
