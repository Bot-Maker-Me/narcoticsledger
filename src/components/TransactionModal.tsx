import { useState, useEffect, type FormEvent } from 'react';
import { X, Loader2, Plus, Minus, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAddTransaction } from '@/hooks/useTransactions';
import type { DrugWithStock } from '@/types/drug';
import type { TransactionType } from '@/types/transaction';

interface TransactionModalProps {
  open: boolean;
  onClose: () => void;
  drug: DrugWithStock;
  type: TransactionType;
}

export default function TransactionModal({ open, onClose, drug, type }: TransactionModalProps) {
  const addMutation = useAddTransaction();
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [patientName, setPatientName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Quantities are multiplied by this drug's Pack Size; 1 means "record as entered".
  const packSize = drug.pack_size > 1 ? drug.pack_size : 1;
  const enteredQty = parseInt(quantity);

  useEffect(() => {
    if (open) {
      setQuantity('');
      setNotes('');
      setPatientName('');
      setErrors({});
    }
  }, [open]);

  if (!open) return null;

  const isPurchase = type === 'PURCHASE';
  const isDispense = type === 'DISPENSE';

  const title = isPurchase ? 'Add Purchase' : isDispense ? 'Reduce Stock' : 'Adjust Stock';
  const description = isPurchase
    ? `Record a stock purchase for ${drug.description}`
    : isDispense
      ? `Record a dispense for ${drug.description} — this reduces stock`
      : `Adjust stock for ${drug.description}`;

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    const qty = parseInt(quantity);
    if (!quantity || isNaN(qty)) {
      next.quantity = 'Quantity is required';
    } else if (qty <= 0) {
      next.quantity = 'Quantity must be greater than 0';
    } else if (isDispense && qty * packSize > drug.current_stock) {
      next.quantity = `Cannot reduce more than current stock (${drug.current_stock} units)`;
    }
    if (isDispense && !patientName.trim()) {
      next.patientName = 'Patient name is required';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const qty = parseInt(quantity);
      const units = qty * packSize;
      await addMutation.mutateAsync({
        drug_id: drug.id,
        type,
        quantity: units,
        notes: notes.trim() || null,
        patient_name: isDispense ? patientName.trim() : undefined,
      });
      toast.success(
        isPurchase
          ? `Added ${units} units to ${drug.description}`
          : isDispense
            ? `Reduced ${units} units from ${drug.description}`
            : `Adjusted stock for ${drug.description} by ${units} units`
      );
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction failed';
      toast.error(message);
    }
  };

  const isSubmitting = addMutation.isPending;
  const Icon = isPurchase ? Plus : isDispense ? Minus : Plus;

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
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  isPurchase ? 'bg-success-50' : isDispense ? 'bg-error-50' : 'bg-warning-50'
                }`}
              >
                <Icon
                  className={`h-5 w-5 ${
                    isPurchase ? 'text-success-600' : isDispense ? 'text-error-600' : 'text-warning-600'
                  }`}
                />
              </div>
              <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Drug info */}
          <div className="flex items-center gap-3 border-b border-neutral-100 bg-neutral-50/50 px-6 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50">
              <Package className="h-4 w-4 text-primary-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-800">{drug.description}</p>
              <p className="text-xs text-neutral-400">
                DIN: {drug.din} · Current stock: {drug.current_stock}
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 p-6" noValidate>
            <p className="text-sm text-neutral-500">{description}</p>

            <div>
              <label htmlFor="quantity" className="mb-1.5 block text-sm font-medium text-neutral-700">
                Quantity {isDispense && <span className="text-neutral-400">(units to remove)</span>}
              </label>
              <input
                id="quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Enter quantity"
                className="input-field"
                disabled={isSubmitting}
                autoFocus
              />
              {errors.quantity && <p className="mt-1 text-xs text-error-600">{errors.quantity}</p>}
              {packSize > 1 && (
                <p className="mt-1.5 text-xs text-neutral-500">
                  Pack size {packSize}
                  {!isNaN(enteredQty) && enteredQty > 0
                    ? ` · ${enteredQty} × ${packSize} = ${enteredQty * packSize} units will be recorded`
                    : ' · the quantity you enter is multiplied by the pack size'}
                </p>
              )}
            </div>

            {isDispense && (
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
                <p className="mt-1.5 text-xs text-neutral-500">
                  Reductions are recorded as a dispense, so a patient name is required.
                </p>
              </div>
            )}

            <div>
              <label htmlFor="notes" className="mb-1.5 block text-sm font-medium text-neutral-700">
                Notes <span className="text-neutral-400">(optional)</span>
              </label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this transaction..."
                className="input-field min-h-[80px] resize-y"
                disabled={isSubmitting}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="submit"
                className={`btn-primary ${
                  isPurchase
                    ? 'bg-success-600 hover:bg-success-700'
                    : isDispense
                      ? 'bg-error-600 hover:bg-error-700'
                      : ''
                }`}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isSubmitting ? 'Processing...' : title}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
