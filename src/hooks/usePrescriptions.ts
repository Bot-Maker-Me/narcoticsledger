import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchStockByDrugId } from '@/lib/stockLevels';
import type { Prescription, PrescriptionFormData, PrescriptionWithDrug } from '@/types/prescription';

async function fetchPrescriptions(): Promise<PrescriptionWithDrug[]> {
  const { data, error } = await supabase
    .from('prescriptions')
    .select('*, drugs!inner(description, din)')
    .order('created_at', { ascending: false });

  if (error) throw error;

  let stockMap = new Map<string, number>();
  try {
    stockMap = await fetchStockByDrugId();
  } catch {
    stockMap = new Map();
  }

  return (data ?? []).map((row) => {
    const drug = row.drugs as unknown as {
      description: string;
      din: string;
    };
    return {
      id: row.id,
      user_id: row.user_id,
      drug_id: row.drug_id,
      patient_name: row.patient_name,
      prescriber: row.prescriber,
      quantity_prescribed: row.quantity_prescribed,
      quantity_dispensed: row.quantity_dispensed,
      refills_total: row.refills_total,
      refills_remaining: row.refills_remaining,
      status: row.status,
      image_url: row.image_url,
      notes: row.notes,
      created_at: row.created_at,
      drug_description: drug?.description ?? 'Unknown',
      drug_din: drug?.din ?? '--------',
      drug_current_stock: stockMap.get(row.drug_id) ?? 0,
    } as PrescriptionWithDrug;
  });
}

async function createPrescription(formData: PrescriptionFormData): Promise<Prescription> {
  const { data, error } = await supabase
    .from('prescriptions')
    .insert({
      drug_id: formData.drug_id,
      patient_name: formData.patient_name,
      prescriber: formData.prescriber,
      quantity_prescribed: formData.quantity_prescribed,
      refills_total: formData.refills_total,
      refills_remaining: formData.refills_total,
      notes: formData.notes ?? null,
      image_url: formData.image_url ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function cancelPrescription(id: string): Promise<void> {
  const { error } = await supabase
    .from('prescriptions')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) throw error;
}

async function deletePrescription(id: string): Promise<void> {
  const { error } = await supabase.from('prescriptions').delete().eq('id', id);
  if (error) throw error;
}

async function dispensePrescription({
  prescriptionId,
  quantity,
}: {
  prescriptionId: string;
  quantity: number;
}): Promise<Prescription> {
  const { data, error } = await supabase.rpc('dispense_prescription', {
    p_prescription_id: prescriptionId,
    p_quantity: quantity,
  });

  if (error) throw error;
  return data as Prescription;
}

async function uploadPrescriptionImage(file: File, userId: string): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('prescriptions')
    .upload(fileName, file);

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('prescriptions').getPublicUrl(fileName);
  return data.publicUrl;
}

export function usePrescriptions() {
  return useQuery({
    queryKey: ['prescriptions'],
    queryFn: fetchPrescriptions,
  });
}

export function useCreatePrescription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPrescription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
    },
  });
}

export function useCancelPrescription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelPrescription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
    },
  });
}

export function useDeletePrescription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePrescription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
    },
  });
}

export function useDispensePrescription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: dispensePrescription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prescriptions'] });
      queryClient.invalidateQueries({ queryKey: ['drugs'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

export function useUploadPrescriptionImage() {
  return useMutation({
    mutationFn: ({ file, userId }: { file: File; userId: string }) =>
      uploadPrescriptionImage(file, userId),
  });
}
