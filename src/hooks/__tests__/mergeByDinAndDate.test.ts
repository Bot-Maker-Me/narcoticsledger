import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/dinReference', () => ({
  fetchReferenceEntries: async () => undefined,
  getDinReferenceEntry: () => null,
  referenceLabel: () => '',
}));

import { mergeByDinAndDate } from '@/hooks/useImportedRecords';

const row = (quantity: number, date = '2026-03-30') => ({ din: '00125083', quantity, date });

describe('mergeByDinAndDate', () => {
  it('lets a negative row reduce the day total', () => {
    expect(mergeByDinAndDate([row(300), row(-100)]).map((r) => r.quantity)).toEqual([200]);
  });

  it('keeps a day that nets below zero, negative', () => {
    expect(mergeByDinAndDate([row(-100)]).map((r) => r.quantity)).toEqual([-100]);
  });

  it('drops a day that nets to exactly zero', () => {
    expect(mergeByDinAndDate([row(100), row(-100)])).toEqual([]);
  });

  it('splits a huge negative total instead of rejecting it', () => {
    expect(mergeByDinAndDate([row(-2_500_000)]).map((r) => r.quantity)).toEqual([-1_000_000, -1_000_000, -500_000]);
  });
});
