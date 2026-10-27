import { useState, type FormEvent } from 'react';
import { X, Loader2, Pill, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDispensePrescription } from '@/hooks/usePrescriptions';
import type { PrescriptionWithDrug } from '@/types/prescription';

interface DispenseModalProps {
  open: boolean;
  onClose: () => void;
  prescription: PrescriptionWithDrug;
}

export default function DispenseModal({ open, onClose, prescription }: DispenseModalProps) {
  const dispenseMutation = useDispensePrescription();
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  const remaining = prescription.quantity_prescribed - prescription.quantity_dispensed;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const qty = parseInt(quantity);
    if (!quantity || isNaN(qty) || qty <= 0) {
      setError('Quantity must be greater than 0');
      return;
    }
    if (qty > remaining) {
      setError(`Cannot dispense more than ${remaining} remaining`);
      return;
    }
    if (qty > prescription.drug_current_stock) {
      setError(`Insufficient drug stock. Current stock: ${prescription.drug_current_stock}`);
      return;
    }

    setError('');
    try {
      await dispenseMutation.mutateAsync({ prescriptionId: prescription.id, quantity: qty });
      toast.success(`Dispensed ${qty} units of ${prescription.drug_description}`);
      setQuantity('');
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to dispense';
      toast.error(message);
    }
  };

  const isSubmitting = dispenseMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md animate-slide-up">
        <div className="card overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
                <Pill className="h-5 w-5 text-primary-600" />
              </div>
              <h2 className="text-lg font-semibold text-neutral-900">Dispense Prescription</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Info */}
          <div className="border-b border-neutral-100 bg-neutral-50/50 px-6 py-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">Patient</span>
              <span className="text-sm font-medium text-neutral-800">{prescription.patient_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">Drug</span>
              <span className="text-sm font-medium text-neutral-800">{prescription.drug_description}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">Prescriber</span>
              <span className="text-sm text-neutral-700">{prescription.prescriber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">Prescribed</span>
              <span className="text-sm text-neutral-700">{prescription.quantity_prescribed}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">Already Dispensed</span>
              <span className="text-sm text-neutral-700">{prescription.quantity_dispensed}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">Remaining</span>
              <span className="text-sm font-semibold text-primary-700">{remaining}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">Drug Stock</span>
              <span className={`text-sm font-medium ${prescription.drug_current_stock <= 0 ? 'text-error-600' : 'text-neutral-700'}`}>
                {prescription.drug_current_stock}
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 p-6" noValidate>
            <div>
              <label htmlFor="dispenseQty" className="mb-1.5 block text-sm font-medium text-neutral-700">
                Quantity to Dispense
              </label>
              <input
                id="dispenseQty"
                type="number"
                min={1}
                max={remaining}
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setError('');
                }}
                placeholder={`Max ${remaining}`}
                className="input-field"
                disabled={isSubmitting}
                autoFocus
              />
              {error && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-error-600">
                  <AlertTriangle className="h-3 w-3" />
                  {error}
                </p>
              )}
            </div>

            {prescription.drug_current_stock <= 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Drug is out of stock. Cannot dispense.
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isSubmitting || prescription.drug_current_stock <= 0}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? 'Dispensing...' : 'Dispense'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
