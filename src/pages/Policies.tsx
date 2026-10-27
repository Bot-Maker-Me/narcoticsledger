import { useState } from 'react';
import { FileText, Plus, Trash2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAcknowledgePolicy, useDeletePolicy, usePolicies, usePolicyAcks, useSavePolicy } from '@/hooks/useOperations';

export default function Policies() {
  const { data: policies, isError } = usePolicies();
  const { data: acks } = usePolicyAcks();
  const save = useSavePolicy();
  const del = useDeletePolicy();
  const ack = useAcknowledgePolicy();
  const [form, setForm] = useState({ title: '', body: '', version: '1.0' });
  const [staff, setStaff] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const selectedPolicy = policies?.find((p) => p.id === selected);

  return (
    <div>
      <h1 className="font-display text-3xl text-neutral-900">Policies & Procedures</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">Create, share, and record staff acknowledgements.</p>
      {isError && <p className="mb-4 text-sm text-warning-700">Run the latest database migration to enable this module.</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form
          className="card space-y-3 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!form.title.trim()) return;
            try {
              await save.mutateAsync(form);
              setForm({ title: '', body: '', version: '1.0' });
              toast.success('Policy saved');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Save failed');
            }
          }}
        >
          <h2 className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" /> New policy</h2>
          <input className="input-field" placeholder="Title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          <input className="input-field" placeholder="Version" value={form.version} onChange={(e) => setForm((p) => ({ ...p, version: e.target.value }))} />
          <textarea className="input-field min-h-[160px]" placeholder="Policy text..." value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} />
          <button className="btn-primary">Save policy</button>
        </form>

        <div className="space-y-3">
          {(policies ?? []).map((p) => (
            <button key={p.id} type="button" onClick={() => setSelected(p.id)} className={`card w-full p-4 text-left ${selected === p.id ? 'ring-2 ring-primary-300' : ''}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{p.title}</p>
                  <p className="text-xs text-neutral-500">v{p.version}</p>
                </div>
                <FileText className="h-4 w-4 text-primary-600" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedPolicy && (
        <div className="card mt-6 p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold">{selectedPolicy.title}</h2>
              <p className="whitespace-pre-wrap mt-3 text-sm text-neutral-700">{selectedPolicy.body}</p>
            </div>
            <button className="btn-secondary text-error-600" onClick={() => del.mutate(selectedPolicy.id)}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <input className="input-field" placeholder="Staff name" value={staff} onChange={(e) => setStaff(e.target.value)} />
            <button
              className="btn-primary"
              onClick={async () => {
                if (!staff.trim()) return;
                await ack.mutateAsync({ policy_id: selectedPolicy.id, staff_name: staff.trim() });
                setStaff('');
                toast.success('Acknowledged');
              }}
            >
              <Check className="h-4 w-4" /> Acknowledge
            </button>
          </div>
          <ul className="mt-4 text-sm text-neutral-600">
            {(acks ?? [])
              .filter((a) => a.policy_id === selectedPolicy.id)
              .map((a) => (
                <li key={a.id}>
                  {a.staff_name} · {new Date(a.acknowledged_at).toLocaleString()}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
