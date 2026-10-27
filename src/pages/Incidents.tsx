import { useState } from 'react';
import toast from 'react-hot-toast';
import { useIncidents, useSaveIncident } from '@/hooks/useOperations';
import type { IncidentCategory, IncidentSeverity, IncidentStatus } from '@/types/operations';

export default function Incidents() {
  const { data, isError } = useIncidents();
  const save = useSaveIncident();
  const [form, setForm] = useState({
    title: '',
    category: 'dispensing' as IncidentCategory,
    severity: 'medium' as IncidentSeverity,
    description: '',
  });

  const openCount = (data ?? []).filter((i) => i.status !== 'closed').length;

  return (
    <div>
      <h1 className="font-display text-3xl text-neutral-900">Incident Reporting</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">
        Log operational errors, spot trends, and close the loop. {openCount} open.
      </p>
      {isError && <p className="mb-4 text-sm text-warning-700">Run the latest database migration to enable this module.</p>}

      <form
        className="card mb-6 grid grid-cols-1 gap-3 p-5 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.title.trim()) return;
          try {
            await save.mutateAsync(form);
            setForm({ title: '', category: 'dispensing', severity: 'medium', description: '' });
            toast.success('Incident logged');
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Save failed');
          }
        }}
      >
        <input className="input-field sm:col-span-2" placeholder="Incident title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
        <select className="input-field" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as IncidentCategory }))}>
          <option value="dispensing">Dispensing</option>
          <option value="inventory">Inventory</option>
          <option value="delivery">Delivery</option>
          <option value="narcotic">Narcotic</option>
          <option value="other">Other</option>
        </select>
        <select className="input-field" value={form.severity} onChange={(e) => setForm((p) => ({ ...p, severity: e.target.value as IncidentSeverity }))}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <textarea className="input-field min-h-[80px] sm:col-span-2" placeholder="What happened?" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
        <button className="btn-primary">Log incident</button>
      </form>

      <div className="space-y-3">
        {(data ?? []).map((inc) => (
          <div key={inc.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{inc.title}</p>
                <p className="text-xs capitalize text-neutral-500">
                  {inc.category} · {inc.severity} · {inc.status}
                </p>
                <p className="mt-2 text-sm text-neutral-600">{inc.description}</p>
              </div>
              <select
                className="input-field w-40"
                value={inc.status}
                onChange={(e) => save.mutate({ id: inc.id, title: inc.title, status: e.target.value as IncidentStatus })}
              >
                <option value="open">Open</option>
                <option value="investigating">Investigating</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
