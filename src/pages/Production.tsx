import { useState } from 'react';
import toast from 'react-hot-toast';
import { useProductionBatches, useSaveBatch } from '@/hooks/useOperations';

export default function Production() {
  const { data, isError } = useProductionBatches();
  const save = useSaveBatch();
  const [form, setForm] = useState({
    product_name: '',
    din: '',
    quantity: 1,
    lot_number: '',
    check1_by: '',
    check2_by: '',
    notes: '',
  });

  return (
    <div>
      <h1 className="font-display text-3xl text-neutral-900">Batch Production</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">
        Digital batch tracking with two independent checks before a lot is completed.
      </p>
      {isError && <p className="mb-4 text-sm text-warning-700">Run the latest database migration to enable this module.</p>}

      <form
        className="card mb-6 grid grid-cols-1 gap-3 p-5 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.product_name.trim()) return;
          try {
            await save.mutateAsync({
              product_name: form.product_name,
              din: form.din || null,
              quantity: form.quantity,
              lot_number: form.lot_number || null,
              check1_by: form.check1_by || null,
              check2_by: form.check2_by || null,
              notes: form.notes || null,
              status: form.check1_by && form.check2_by && form.check1_by !== form.check2_by ? 'completed' : 'in_progress',
            });
            toast.success('Batch saved');
            setForm({ product_name: '', din: '', quantity: 1, lot_number: '', check1_by: '', check2_by: '', notes: '' });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Save failed');
          }
        }}
      >
        <input className="input-field" placeholder="Product name" value={form.product_name} onChange={(e) => setForm((p) => ({ ...p, product_name: e.target.value }))} />
        <input className="input-field" placeholder="DIN (optional)" value={form.din} onChange={(e) => setForm((p) => ({ ...p, din: e.target.value }))} />
        <input className="input-field" type="number" min={1} value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: parseInt(e.target.value) || 1 }))} />
        <input className="input-field" placeholder="Lot number" value={form.lot_number} onChange={(e) => setForm((p) => ({ ...p, lot_number: e.target.value }))} />
        <input className="input-field" placeholder="Check 1 by" value={form.check1_by} onChange={(e) => setForm((p) => ({ ...p, check1_by: e.target.value }))} />
        <input className="input-field" placeholder="Check 2 by (must be different)" value={form.check2_by} onChange={(e) => setForm((p) => ({ ...p, check2_by: e.target.value }))} />
        <textarea className="input-field sm:col-span-2" placeholder="Notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
        <p className="sm:col-span-2 text-xs text-neutral-500">A batch completes only when two different people have signed the independent checks.</p>
        <button className="btn-primary">Save batch</button>
      </form>

      <div className="space-y-3">
        {(data ?? []).map((b) => (
          <div key={b.id} className="card p-4">
            <div className="flex justify-between">
              <div>
                <p className="font-medium">{b.product_name}</p>
                <p className="text-xs text-neutral-500">
                  Qty {b.quantity}
                  {b.lot_number ? ` · Lot ${b.lot_number}` : ''}
                  {b.din ? ` · DIN ${b.din}` : ''}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Check 1: {b.check1_by || '—'} · Check 2: {b.check2_by || '—'}
                </p>
              </div>
              <span className="text-xs capitalize text-neutral-500">{b.status.replace('_', ' ')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
