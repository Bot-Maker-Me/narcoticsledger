export type PrescriptionStatus = 'active' | 'completed' | 'cancelled';

export const PRESCRIPTION_STATUSES: PrescriptionStatus[] = ['active', 'completed', 'cancelled'];

export interface Prescription {
  id: string;
  user_id: string;
  drug_id: string;
  patient_name: string;
  prescriber: string;
  quantity_prescribed: number;
  quantity_dispensed: number;
  refills_total: number;
  refills_remaining: number;
  status: PrescriptionStatus;
  image_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface PrescriptionWithDrug extends Prescription {
  drug_description: string;
  drug_din: string;
  drug_current_stock: number;
}

export interface PrescriptionFormData {
  drug_id: string;
  patient_name: string;
  prescriber: string;
  quantity_prescribed: number;
  refills_total: number;
  notes?: string | null;
  image_url?: string | null;
}
