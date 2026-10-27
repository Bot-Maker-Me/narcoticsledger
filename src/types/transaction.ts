export type TransactionType = 'PURCHASE' | 'DISPENSE' | 'ADJUSTMENT';

export const TRANSACTION_TYPES: TransactionType[] = ['PURCHASE', 'DISPENSE', 'ADJUSTMENT'];

export interface InventoryTransaction {
  id: string;
  user_id: string;
  drug_id: string;
  type: TransactionType;
  quantity: number;
  notes: string | null;
  source: string;
  created_at: string;
}

export interface TransactionWithDrug extends InventoryTransaction {
  drug_description: string;
  drug_din: string;
}

export interface TransactionInput {
  drug_id: string;
  type: TransactionType;
  quantity: number;
  notes?: string | null;
  /** Required for DISPENSE: the database records reductions as a dispense against a patient. */
  patient_name?: string;
}
