import { useState, useEffect, type FormEvent } from 'react';
import { X, Loader2, FileText, Upload, ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDrugs } from '@/hooks/useDrugs';
import { useCreatePrescription, useUploadPrescriptionImage } from '@/hooks/usePrescriptions';
import { useAuth } from '@/context/AuthContext';

interface PrescriptionModalProps {
  open: boolean;
  onClose: () => void;
}

export default function PrescriptionModal({ open, onClose }: PrescriptionModalProps) {
  const { data: drugs, isLoading: drugsLoading } = useDrugs();
  const createMutation = useCreatePrescription();
  const uploadMutation = useUploadPrescriptionImage();
  const { user } = useAuth();

  const [drugId, setDrugId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [prescriber, setPrescriber] = useState('');
  const [quantity, setQuantity] = useState('');
  const [refills, setRefills] = useState('0');
  const [notes, setNotes] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open) {
      setDrugId('');
      setPatientName('');
      setPrescriber('');
      setQuantity('');
      setRefills('0');
      setNotes('');
      setImageFile(null);
      setImagePreview(null);
      setErrors({});
    }
  }, [open]);

  if (!open) return null;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!drugId) next.drugId = 'Please select a drug';
    if (!patientName.trim()) next.patientName = 'Patient name is required';
    if (!prescriber.trim()) next.prescriber = 'Prescriber is required';
    const qty = parseInt(quantity);
    if (!quantity || isNaN(qty) || qty <= 0) next.quantity = 'Quantity must be greater than 0';
    const ref = parseInt(refills);
    if (isNaN(ref) || ref < 0) next.refills = 'Refills cannot be negative';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    let imageUrl: string | null = null;

    if (imageFile && user) {
      setUploading(true);
      try {
        imageUrl = await uploadMutation.mutateAsync({ file: imageFile, userId: user.id });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to upload image';
        toast.error(message);
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    try {
      await createMutation.mutateAsync({
        drug_id: drugId,
        patient_name: patientName.trim(),
        prescriber: prescriber.trim(),
        quantity_prescribed: parseInt(quantity),
        refills_total: parseInt(refills),
        notes: notes.trim() || null,
        image_url: imageUrl,
      });
      toast.success('Prescription created');
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create prescription';
      toast.error(message);
    }
  };

  const isSubmitting = createMutation.isPending || uploading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="card overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 sticky top-0 bg-white z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary-50">
                <FileText className="h-5 w-5 text-secondary-600" />
              </div>
              <h2 className="text-lg font-semibold text-neutral-900">New Prescription</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 p-6" noValidate>
            <div>
              <label htmlFor="drug" className="mb-1.5 block text-sm font-medium text-neutral-700">
                Drug
              </label>
              <select
                id="drug"
                value={drugId}
                onChange={(e) => setDrugId(e.target.value)}
                className="input-field cursor-pointer"
                disabled={isSubmitting || drugsLoading}
              >
                <option value="">{drugsLoading ? 'Loading drugs...' : 'Select a drug'}</option>
                {drugs?.map((drug) => (
                  <option key={drug.id} value={drug.id}>
                    {drug.description} (DIN: {drug.din})
                  </option>
                ))}
              </select>
              {errors.drugId && <p className="mt-1 text-xs text-error-600">{errors.drugId}</p>}
              {drugs && drugs.length === 0 && !drugsLoading && (
                <p className="mt-1 text-xs text-warning-600">
                  No drugs in inventory. Add a drug first.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="patientName" className="mb-1.5 block text-sm font-medium text-neutral-700">
                Patient Name
              </label>
              <input
                id="patientName"
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="e.g. John Anderson"
                className="input-field"
                disabled={isSubmitting}
              />
              {errors.patientName && <p className="mt-1 text-xs text-error-600">{errors.patientName}</p>}
            </div>

            <div>
              <label htmlFor="prescriber" className="mb-1.5 block text-sm font-medium text-neutral-700">
                Prescriber
              </label>
              <input
                id="prescriber"
                type="text"
                value={prescriber}
                onChange={(e) => setPrescriber(e.target.value)}
                placeholder="e.g. Dr. Sarah Mitchell"
                className="input-field"
                disabled={isSubmitting}
              />
              {errors.prescriber && <p className="mt-1 text-xs text-error-600">{errors.prescriber}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="quantity" className="mb-1.5 block text-sm font-medium text-neutral-700">
                  Quantity
                </label>
                <input
                  id="quantity"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 30"
                  className="input-field"
                  disabled={isSubmitting}
                />
                {errors.quantity && <p className="mt-1 text-xs text-error-600">{errors.quantity}</p>}
              </div>

              <div>
                <label htmlFor="refills" className="mb-1.5 block text-sm font-medium text-neutral-700">
                  Refills
                </label>
                <input
                  id="refills"
                  type="number"
                  min={0}
                  value={refills}
                  onChange={(e) => setRefills(e.target.value)}
                  className="input-field"
                  disabled={isSubmitting}
                />
                {errors.refills && <p className="mt-1 text-xs text-error-600">{errors.refills}</p>}
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="mb-1.5 block text-sm font-medium text-neutral-700">
                Notes <span className="text-neutral-400">(optional)</span>
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                className="input-field min-h-[60px] resize-y"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                Prescription Image <span className="text-neutral-400">(optional)</span>
              </label>
              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Prescription preview"
                    className="h-32 w-full rounded-lg border border-neutral-200 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                    }}
                    className="absolute right-2 top-2 rounded-lg bg-white/90 p-1.5 text-neutral-500 shadow-soft transition-colors hover:text-error-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-neutral-200 py-6 transition-colors hover:border-primary-300 hover:bg-primary-50/30">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    disabled={isSubmitting}
                  />
                  <ImageIcon className="h-8 w-8 text-neutral-300" />
                  <span className="mt-2 text-sm text-neutral-400">Click to upload an image</span>
                  <span className="mt-0.5 text-xs text-neutral-300">PNG, JPG up to 5MB</span>
                </label>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2 sticky bottom-0 bg-white">
              <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {uploading ? 'Uploading...' : isSubmitting ? 'Saving...' : 'Create prescription'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
