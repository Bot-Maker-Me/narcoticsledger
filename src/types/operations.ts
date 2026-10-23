export interface PharmacyTeam {
  id: string;
  user_id: string;
  name: string;
  store_name: string | null;
  created_at: string;
}

export type DeliveryRunStatus = 'draft' | 'optimized' | 'in_progress' | 'completed';
export type DeliveryStopStatus =
  | 'pending'
  | 'in_transit'
  | 'delivered'
  | 'undeliverable'
  | 'rescheduled'
  | 'returned';
export type PaymentStatus = 'unpaid' | 'collected' | 'waived';
export type PaymentMethod = 'cash' | 'card' | 'square' | 'other';

export interface DeliveryRun {
  id: string;
  user_id: string;
  team_id: string | null;
  name: string;
  status: DeliveryRunStatus;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface DeliveryStop {
  id: string;
  user_id: string;
  run_id: string;
  sequence: number;
  patient_name: string;
  phone: string | null;
  address: string;
  city: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  rx_notes: string | null;
  status: DeliveryStopStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  payment_amount_cents: number;
  undeliverable_reason: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface DeliveryAuditEntry {
  id: string;
  user_id: string;
  run_id: string | null;
  stop_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface PolicyDoc {
  id: string;
  user_id: string;
  title: string;
  body: string;
  version: string;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface PolicyAck {
  id: string;
  user_id: string;
  policy_id: string;
  staff_name: string;
  acknowledged_at: string;
}

export type IncidentCategory = 'dispensing' | 'inventory' | 'delivery' | 'narcotic' | 'other';
export type IncidentSeverity = 'low' | 'medium' | 'high';
export type IncidentStatus = 'open' | 'investigating' | 'closed';

export interface Incident {
  id: string;
  user_id: string;
  title: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  description: string;
  status: IncidentStatus;
  occurred_at: string;
  resolution: string | null;
  created_at: string;
}

export interface TimePunch {
  id: string;
  user_id: string;
  staff_name: string;
  clock_in: string;
  clock_out: string | null;
  notes: string | null;
  created_at: string;
}

export type ProductionStatus = 'in_progress' | 'completed' | 'voided';

export interface ProductionBatch {
  id: string;
  user_id: string;
  product_name: string;
  din: string | null;
  quantity: number;
  lot_number: string | null;
  check1_by: string | null;
  check2_by: string | null;
  status: ProductionStatus;
  notes: string | null;
  produced_at: string | null;
  created_at: string;
}

export type MedChangeStatus = 'pending' | 'verified' | 'applied';

export interface MedChange {
  id: string;
  user_id: string;
  patient_name: string;
  drug_from: string;
  drug_to: string;
  reason: string | null;
  status: MedChangeStatus;
  requested_by: string | null;
  verified_by: string | null;
  created_at: string;
}
