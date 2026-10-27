import { describe, it, expect, vi } from 'vitest';

// useReconciliation imports the Supabase client, which needs env vars at import time.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { computeFlag } from '@/hooks/useReconciliation';

describe('computeFlag', () => {
  it('is pending while nothing has been counted', () => {
    expect(computeFlag(null, 10, 'Narcotic')).toBe('Pending count');
    expect(computeFlag(null, 0, null)).toBe('Pending count');
  });

  it('is OK when the count matches exactly', () => {
    expect(computeFlag(10, 10, 'Narcotic')).toBe('OK');
    expect(computeFlag(0, 0, 'Targeted')).toBe('OK');
  });

  it('requires verification for a variance on a narcotic or controlled drug', () => {
    expect(computeFlag(8, 10, 'Narcotic')).toBe('Verify');
    expect(computeFlag(12, 10, 'Narcotic')).toBe('Verify');
    expect(computeFlag(8, 10, 'Controlled')).toBe('Verify');
  });

  it('is only a review item for anything else', () => {
    expect(computeFlag(8, 10, 'Targeted')).toBe('Review');
    expect(computeFlag(8, 10, 'Verify')).toBe('Review');
    expect(computeFlag(8, 10, null)).toBe('Review');
  });

  /**
   * These cases mirror `public.update_actual_count` and
   * `public.update_reconciliation_opening`, which own the flag for saved cycles. A draft
   * used to show 'Review' and then flip to 'Verify' the moment it was saved.
   */
  it('agrees with the database rules', () => {
    const cases: Array<[number | null, number, string | null, string]> = [
      [null, 5, 'Narcotic', 'Pending count'],
      [5, 5, 'Targeted', 'OK'],
      [5, 5, 'Narcotic', 'OK'],
      [4, 5, 'Narcotic', 'Verify'],
      [4, 5, 'Controlled', 'Verify'],
      [4, 5, 'Targeted', 'Review'],
      [4, 5, 'Verify', 'Review'],
      [4, 5, null, 'Review'],
      [7, 5, 'Narcotic', 'Verify'],
    ];

    for (const [actual, expected, schedule, flag] of cases) {
      expect(computeFlag(actual, expected, schedule)).toBe(flag);
    }
  });
});
