import { useState, useEffect, type FormEvent } from 'react';
import { X, Loader2, Pill } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCreateDrug, useUpdateDrug, useCheckDinUnique } from '@/hooks/useDrugs';
import { useDinReference } from '@/hooks/useDinReference';
import { referenceLabel } from '@/lib/dinReference';
import { SCHEDULES, type Drug, type DrugFormData, type DrugSchedule } from '@/types/drug';

interface DrugModalProps {
  open: boolean;
  onClose: () => void;
  editingDrug?: Drug | null;
}

export default function DrugModal({ open, onClose, editingDrug }: DrugModalProps) {
  const isEdit = !!editingDrug;
  const createMutation = useCreateDrug();
  const updateMutation = useUpdateDrug();
  const dinCheckMutation = useCheckDinUnique();
  const { referenceFor } = useDinReference();

  const [form, setForm] = useState<DrugFormData>({
    din: '',
    description: '',
    schedule: 'Verify',
    pack_size: 1,
    reorder_level: 50,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [checkingDin, setCheckingDin] = useState(false);

  useEffect(() => {
    if (editingDrug) {
      setForm({
        din: editingDrug.din,
        description: editingDrug.description,
        schedule: editingDrug.schedule,
        pack_size: editingDrug.pack_size,
        reorder_level: editingDrug.reorder_level,
      });
    } else {
      setForm({
        din: '',
        description: '',
        schedule: 'Verify',
        pack_size: 1,
        reorder_level: 50,
      });
    }
    setErrors({});
  }, [editingDrug, open]);

  const validate = async (): Promise<boolean> => {
    const next: Record<string, string> = {};

    if (!form.din) {
      next.din = 'DIN is required';
    } else if (!/^\d{8}$/.test(form.din)) {
      next.din = 'DIN must be exactly 8 digits';
    } else {
      setCheckingDin(true);
      try {
        const isUnique = await dinCheckMutation.mutateAsync({
          din: form.din,
          excludeId: editingDrug?.id,
        });
        if (!isUnique) {
          next.din = 'A drug with this DIN already exists in your inventory';
        }
      } catch {
        next.din = 'Unable to validate DIN uniqueness';
      } finally {
        setCheckingDin(false);
      }
    }

    if (!form.description.trim()) {
      next.description = 'Description is required';
    }

    if (!form.pack_size || form.pack_size <= 0) {
      next.pack_size = 'Pack size must be greater than 0';
    }

    if (form.reorder_level < 0) {
      next.reorder_level = 'Reorder level cannot be negative';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const valid = await validate();
    if (!valid) return;

    try {
      if (isEdit && editingDrug) {
        await updateMutation.mutateAsync({ id: editingDrug.id, formData: form });
        toast.success('Drug updated successfully');
      } else {
        await createMutation.mutateAsync(form);
        toast.success('Drug added to inventory');
      }
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save drug';
      toast.error(message);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  // Match the entered DIN against the CDSA/DPD reference to fill the pack size.
  const referenceMatch = form.din.length === 8 ? referenceFor(form.din) : null;

  const handleDinChange = (value: string) => {
    const din = value.replace(/\D/g, '');
    const reference = din.length === 8 ? referenceFor(din) : null;
    setForm((current) => {
      if (!reference) return { ...current, din };
      const label = referenceLabel(reference);
      return {
        ...current,
        din,
        pack_size: reference.packSize > 0 ? reference.packSize : current.pack_size,
        schedule: reference.schedule ?? current.schedule,
        description: current.description.trim() === '' && label ? label : current.description,
      };
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg animate-slide-up">
        <div className="card overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
                <Pill className="h-5 w-5 text-primary-600" />
              </div>
              <h2 className="text-lg font-semibold text-neutral-900">
                {isEdit ? 'Edit Drug' : 'Add New Drug'}
              </h2>
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
              <label htmlFor="din" className="mb-1.5 block text-sm font-medium text-neutral-700">
                DIN <span className="text-neutral-400">(8 digits)</span>
              </label>
              <input
                id="din"
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={form.din}
                onChange={(e) => handleDinChange(e.target.value)}
                placeholder="00000000"
                className="input-field font-mono tracking-wider"
                disabled={isSubmitting}
              />
              {errors.din && <p className="mt-1 text-xs text-error-600">{errors.din}</p>}
              {form.din.length === 8 &&
                (referenceMatch ? (
                  <p className="mt-1 text-xs text-success-600">
                    CDSA/DPD match: {referenceMatch.description ?? 'reference product'}
                    {referenceMatch.strength ? ` ${referenceMatch.strength}` : ''}
                    {referenceMatch.schedule ? ` · ${referenceMatch.schedule}` : ''}
                    {referenceMatch.packSize > 0 ? ` · pack size ${referenceMatch.packSize}` : ''}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-neutral-400">
                    No CDSA/DPD match for this DIN — enter the pack size manually.
                  </p>
                ))}
            </div>

            <div>
              <label htmlFor="description" className="mb-1.5 block text-sm font-medium text-neutral-700">
                Description
              </label>
              <input
                id="description"
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Amoxicillin 500mg capsules"
                className="input-field"
                disabled={isSubmitting}
              />
              {errors.description && <p className="mt-1 text-xs text-error-600">{errors.description}</p>}
            </div>

            <div>
              <label htmlFor="schedule" className="mb-1.5 block text-sm font-medium text-neutral-700">
                Schedule
              </label>
              <select
                id="schedule"
                value={form.schedule}
                onChange={(e) => setForm({ ...form, schedule: e.target.value as DrugSchedule })}
                className="input-field cursor-pointer"
                disabled={isSubmitting}
              >
                {SCHEDULES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="pack_size" className="mb-1.5 block text-sm font-medium text-neutral-700">
                  Pack Size
                </label>
                <input
                  id="pack_size"
                  type="number"
                  min={1}
                  value={form.pack_size}
                  onChange={(e) => setForm({ ...form, pack_size: parseInt(e.target.value) || 0 })}
                  className="input-field"
                  disabled={isSubmitting}
                />
                {errors.pack_size ? (
                  <p className="mt-1 text-xs text-error-600">{errors.pack_size}</p>
                ) : (
                  <p className="mt-1 text-xs text-neutral-400">
                    Imported and manual quantities are multiplied by this to record total units. Use 1
                    to record quantities as entered.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="reorder_level" className="mb-1.5 block text-sm font-medium text-neutral-700">
                  Reorder Level
                </label>
                <input
                  id="reorder_level"
                  type="number"
                  min={0}
                  value={form.reorder_level}
                  onChange={(e) => setForm({ ...form, reorder_level: parseInt(e.target.value) || 0 })}
                  className="input-field"
                  disabled={isSubmitting}
                />
                {errors.reorder_level && (
                  <p className="mt-1 text-xs text-error-600">{errors.reorder_level}</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={isSubmitting || checkingDin}>
                {isSubmitting || checkingDin ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {checkingDin
                  ? 'Validating...'
                  : isSubmitting
                    ? 'Saving...'
                    : isEdit
                      ? 'Save changes'
                      : 'Add drug'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
