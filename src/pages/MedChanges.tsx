import { useState } from 'react';
import toast from 'react-hot-toast';
import { useMedChanges, useSaveMedChange } from '@/hooks/useOperations';
import type { MedChangeStatus } from '@/types/operations';

export default function MedChanges() {
  const { data, isError } = useMedChanges();
  const save = useSaveMedChange();
  const [form, setForm] = useState({
    patient_name: '',
    drug_from: '',
    drug_to: '',
    reason: '',
    requested_by: '',
  });

  return (
    <div>
      <h1 className="font-display text-3xl text-neutral-900">Med Changes</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">
        Guided medication change tracking with a second-person verify step.
      </p>
      {isError && <p className="mb-4 text-sm text-warning-700">Run the latest database migration to enable this module.</p>}

      <form
        className="card mb-6 grid grid-cols-1 gap-3 p-5 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.patient_name.trim() || !form.drug_from.trim() || !form.drug_to.trim()) return;
          try {
            await save.mutateAsync(form);
            setForm({ patient_name: '', drug_from: '', drug_to: '', reason: '', requested_by: '' });
            toast.success('Change logged');
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Save failed');
          }
        }}
      >
        <input className="input-field" placeholder="Patient" value={form.patient_name} onChange={(e) => setForm((p) => ({ ...p, patient_name: e.target.value }))} />
        <input className="input-field" placeholder="Requested by" value={form.requested_by} onChange={(e) => setForm((p) => ({ ...p, requested_by: e.target.value }))} />
        <input className="input-field" placeholder="From drug" value={form.drug_from} onChange={(e) => setForm((p) => ({ ...p, drug_from: e.target.value }))} />
        <input className="input-field" placeholder="To drug" value={form.drug_to} onChange={(e) => setForm((p) => ({ ...p, drug_to: e.target.value }))} />
        <input className="input-field sm:col-span-2" placeholder="Reason" value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} />
        <button className="btn-primary">Add change</button>
      </form>

      <div className="space-y-3">
        {(data ?? []).map((c) => (
          <div key={c.id} className="card p-4">
            <p className="font-medium">{c.patient_name}</p>
            <p className="text-sm text-neutral-600">
              {c.drug_from} → {c.drug_to}
            </p>
            {c.reason && <p className="text-xs text-neutral-500">{c.reason}</p>}
            <div className="mt-2 flex items-center gap-2">
              <select
                className="input-field w-40"
                value={c.status}
                onChange={(e) =>
                  save.mutate({
                    id: c.id,
                    patient_name: c.patient_name,
                    drug_from: c.drug_from,
                    drug_to: c.drug_to,
                    status: e.target.value as MedChangeStatus,
                    verified_by: e.target.value === 'verified' ? 'Pharmacist' : c.verified_by,
                  })
                }
              >
                <option value="pending">Pending</option>
                <option value="verified">Verified</option>
                <option value="applied">Applied</option>
              </select>
              <span className="text-xs text-neutral-400">{new Date(c.created_at).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
