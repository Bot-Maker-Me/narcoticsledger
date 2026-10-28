import type { ReconciliationItemDraft } from '@/types/reconciliation';

/** The persisted shape of one counting-table row, as the `save_reconciliation_*` RPCs expect. */
export interface ReconciliationItemPayload {
  din: string;
  drug_id: string | null;
  description: string;
  schedule: string;
  opening_balance: number;
  purchased_count: number;
  dispensed_count: number;
  actual_count: number | null;
  flag: string;
  verify_note: string | null;
  locations: ReconciliationItemDraft['locations'];
}

/**
 * Only the fields that are stored. UI-only state (`selected`, the free-text `note`) is
 * deliberately absent, which is what keeps ticking a bulk-edit checkbox from counting as
 * an unsaved change.
 */
export function toItemPayload(items: ReconciliationItemDraft[]): ReconciliationItemPayload[] {
  return items.map((item) => ({
    din: item.din,
    drug_id: item.drug_id,
    description: item.description,
    schedule: item.schedule,
    opening_balance: item.opening_balance,
    purchased_count: item.purchased_count,
    dispensed_count: item.dispensed_count,
    actual_count: item.actual_count,
    flag: item.flag,
    verify_note: item.verify_note ?? null,
    locations: item.locations ?? [],
  }));
}
