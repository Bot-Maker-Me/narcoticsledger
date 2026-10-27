import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { stockLevelsQuery } from '@/lib/stockLevels';
import type { Prescription, PrescriptionFormData, PrescriptionWithDrug } from '@/types/prescription';

/** Prescription images live in a private bucket, so links are signed on read. */
async function signImagePaths(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;

  const { data, error } = await supabase.storage
    .from('prescriptions')
    .createSignedUrls(paths, 60 * 60);

  if (error) {
    console.error('[prescriptions] failed to sign images:', error);
    return map;
  }

  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) map.set(entry.path, entry.signedUrl);
  }
  return map;
}

async function fetchPrescriptions(queryClient: QueryClient): Promise<PrescriptionWithDrug[]> {
  const { data, error } = await supabase
    .from('prescriptions')
    .select('*, drugs!inner(description, din)')
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Shared with useDrugs, so the stock view is only requested once per page load.
  const stockMap = await queryClient.fetchQuery(stockLevelsQuery);

  const imagePaths = (data ?? [])
    .map((row) => row.image_url)
    .filter((path): path is string => !!path);
  const signedImages = await signImagePaths(imagePaths);

  return (data ?? []).map((row) => {
    const drug = row.drugs as unknown as { description: string; din: string };
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
      image_url: row.image_url ? signedImages.get(row.image_url) ?? null : null,
      notes: row.notes,
      created_at: row.created_at,
      drug_description: drug?.description ?? 'Unknown',
      drug_din: drug?.din ?? '--------',
      drug_current_stock: row.drug_id ? stockMap.get(row.drug_id) ?? 0 : 0,
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
  const { error } = await supabase.from('prescriptions').update({ status: 'cancelled' }).eq('id', id);
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

/** Returns the storage path; the bucket is private so links are signed when read. */
async function uploadPrescriptionImage(file: File, userId: string): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

  const { error } = await supabase.storage.from('prescriptions').upload(fileName, file);
  if (error) throw error;

  return fileName;
}

export function usePrescriptions() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['prescriptions'],
    queryFn: () => fetchPrescriptions(queryClient),
  });
}

export function useCreatePrescription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPrescription,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['prescriptions'] }),
  });
}

export function useCancelPrescription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelPrescription,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['prescriptions'] }),
  });
}

export function useDeletePrescription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePrescription,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['prescriptions'] }),
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
