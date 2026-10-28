import { describe, expect, it } from 'vitest';
import { toItemPayload } from '@/lib/reconciliationPayload';
import type { ReconciliationItemDraft } from '@/types/reconciliation';

const item = (over: Partial<ReconciliationItemDraft> = {}): ReconciliationItemDraft => ({
  din: '00012345',
  drug_id: null,
  description: 'Drug',
  schedule: 'Narcotic',
  opening_balance: 1,
  purchased_count: 2,
  dispensed_count: 1,
  actual_count: null,
  flag: 'Pending count',
  ...over,
});

describe('toItemPayload', () => {
  it('drops UI-only state so selecting rows is not an unsaved change', () => {
    const plain = JSON.stringify(toItemPayload([item()]));
    const selected = JSON.stringify(toItemPayload([item({ selected: true, note: 'scratch' })]));
    expect(selected).toBe(plain);
  });

  it('changes when a stored field changes', () => {
    expect(JSON.stringify(toItemPayload([item({ actual_count: 4 })]))).not.toBe(
      JSON.stringify(toItemPayload([item()]))
    );
  });

  it('normalises missing optional fields', () => {
    const [row] = toItemPayload([item()]);
    expect(row.verify_note).toBeNull();
    expect(row.locations).toEqual([]);
  });
});
