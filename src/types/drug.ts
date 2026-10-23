export type DrugSchedule = 'Narcotic' | 'Controlled' | 'Targeted' | 'Verify';

export const SCHEDULES: DrugSchedule[] = ['Narcotic', 'Controlled', 'Targeted', 'Verify'];

export interface Drug {
  id: string;
  user_id: string;
  din: string;
  description: string;
  schedule: DrugSchedule;
  pack_size: number;
  reorder_level: number;
  created_at: string;
}

export interface DrugWithStock extends Drug {
  current_stock: number;
}

export interface DrugFormData {
  din: string;
  description: string;
  schedule: DrugSchedule;
  pack_size: number;
  reorder_level: number;
}
