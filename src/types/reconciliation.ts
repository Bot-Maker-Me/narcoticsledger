export interface CountLocation {
  name: string;
  count: number | null;
}

export const DEFAULT_COUNT_LOCATIONS: CountLocation[] = [
  { name: 'Shelf', count: null },
  { name: 'Blister packs', count: null },
  { name: 'Med pouches', count: null },
];

export type ReconciliationStatus = 'draft' | 'in_progress' | 'completed';
export type ReconciliationFlag = 'OK' | 'Pending count' | 'Review' | 'Verify';

export interface ReconChecklist {
  files_uploaded: boolean;
  counts_complete: boolean;
  discrepancies_reviewed: boolean;
  second_check: boolean;
  report_exported: boolean;
}

export const EMPTY_CHECKLIST: ReconChecklist = {
  files_uploaded: false,
  counts_complete: false,
  discrepancies_reviewed: false,
  second_check: false,
  report_exported: false,
};

export interface ReconciliationCycle {
  id: string;
  user_id: string;
  start_date: string | null;
  end_date: string | null;
  performed_by: string | null;
  verified_by: string | null;
  notes: string | null;
  status: ReconciliationStatus;
  checklist?: ReconChecklist | null;
  created_at: string;
}

export interface ReconciliationItem {
  id: string;
  cycle_id: string;
  user_id: string;
  drug_id: string | null;
  din: string;
  description: string | null;
  schedule: string | null;
  opening_balance: number;
  purchased_count: number;
  dispensed_count: number;
  actual_count: number | null;
  flag: ReconciliationFlag;
  verify_note?: string | null;
  locations?: CountLocation[] | null;
  suggested_adjustment?: number | null;
  created_at: string;
}

export interface ReconciliationItemWithCycle extends ReconciliationItem {
  cycle_status: ReconciliationStatus;
  cycle_created_at: string;
}

export interface ParsedDinData {
  din: string;
  purchased: number;
  dispensed: number;
  description?: string;
  transactions?: Array<{
    date: Date | null;
    quantity: number;
    type: 'purchase' | 'dispense';
  }>;
}

export interface ReconciliationItemDraft {
  din: string;
  drug_id: string | null;
  description: string;
  schedule: string;
  opening_balance: number;
  purchased_count: number;
  dispensed_count: number;
  actual_count: number | null;
  flag: ReconciliationFlag;
  verify_note?: string | null;
  locations?: CountLocation[];
  selected?: boolean;
  note?: string; // User notes for specific drug
}

export interface CycleFormData {
  start_date: string;
  end_date: string;
  performed_by: string;
  verified_by: string;
  notes: string;
  checklist?: ReconChecklist;
}

export interface HistoryState {
  items: ReconciliationItemDraft[];
  timestamp: number;
}
