export type TransactionType = 'PURCHASE' | 'DISPENSE' | 'ADJUSTMENT';

export const TRANSACTION_TYPES: TransactionType[] = ['PURCHASE', 'DISPENSE', 'ADJUSTMENT'];

export interface InventoryTransaction {
  id: string;
  user_id: string;
  drug_id: string;
  /** Normalised from the ledger's `transaction_type` column. */
  type: TransactionType;
  quantity: number;
  notes: string | null;
  source: string;
  /** The uploaded file (or ledger label) this row came from. */
  file_name: string | null;
  /** Ledger calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Display date: the ledger day, falling back to the insertion timestamp. */
  created_at: string;
  /**
   * Ledger rows are never deleted — a file is voided instead, which keeps the audit trail
   * intact while removing the rows from stock maths and the record browsers.
   */
  voided_at: string | null;
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
