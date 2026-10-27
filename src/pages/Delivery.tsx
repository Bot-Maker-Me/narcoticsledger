import { useMemo, useState, type FormEvent } from 'react';
import {
  Truck,
  Plus,
  MapPin,
  Play,
  CheckCircle2,
  CreditCard,
  RotateCcw,
  PackageX,
  Loader2,
  Trash2,
  Route,
  Users,
  ScrollText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  useAddDeliveryStop,
  useCreateDeliveryRun,
  useCreateTeam,
  useDeleteDeliveryRun,
  useDeleteDeliveryStop,
  useDeliveryAudit,
  useDeliveryRuns,
  useDeliveryStops,
  useOptimizeRun,
  usePharmacyTeams,
  useUpdateDeliveryRun,
  useUpdateDeliveryStop,
} from '@/hooks/useDelivery';
import type { DeliveryStop, DeliveryStopStatus, PaymentMethod } from '@/types/operations';
import { formatMoney } from '@/lib/routeOptimize';

export default function Delivery() {
  const { data: runs, isLoading, isError } = useDeliveryRuns();
  const { data: teams } = usePharmacyTeams();
  const createRun = useCreateDeliveryRun();
  const createTeam = useCreateTeam();
  const deleteRun = useDeleteDeliveryRun();
  const updateRun = useUpdateDeliveryRun();

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runName, setRunName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [newTeam, setNewTeam] = useState({ name: '', store_name: '' });

  const selectedRun = runs?.find((r) => r.id === selectedRunId) ?? null;

  const handleCreateRun = async (e: FormEvent) => {
    e.preventDefault();
    if (!runName.trim()) return;
    try {
      const run = await createRun.mutateAsync({ name: runName.trim(), team_id: teamId || null });
      setRunName('');
      setSelectedRunId(run.id);
      toast.success('Delivery run created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create run. Apply the latest database migration.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-neutral-900">Prescription Delivery</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Create a run, add stops, optimize the route, collect payment at the door, and keep a paperless audit trail.
        </p>
      </div>

      {isError && (
        <div className="mb-4 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
          Delivery tables are missing. Run the new Supabase migration, then refresh.
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <form onSubmit={handleCreateRun} className="card p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-neutral-800">New run</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              className="input-field"
              placeholder="e.g. Thursday PM run"
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
            />
            <select className="input-field sm:w-56" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">No team</option>
              {(teams ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.store_name ? ` · ${t.store_name}` : ''}
                </option>
              ))}
            </select>
            <button className="btn-primary" disabled={createRun.isPending}>
              <Plus className="h-4 w-4" />
              Create
            </button>
          </div>
        </form>
        <form
          className="card p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newTeam.name.trim()) return;
            try {
              await createTeam.mutateAsync(newTeam);
              setNewTeam({ name: '', store_name: '' });
              toast.success('Team added');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Could not add team');
            }
          }}
        >
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-800">
            <Users className="h-4 w-4" /> Teams / stores
          </h2>
          <input
            className="input-field mb-2"
            placeholder="Team name"
            value={newTeam.name}
            onChange={(e) => setNewTeam((p) => ({ ...p, name: e.target.value }))}
          />
          <input
            className="input-field mb-2"
            placeholder="Store (optional)"
            value={newTeam.store_name}
            onChange={(e) => setNewTeam((p) => ({ ...p, store_name: e.target.value }))}
          />
          <button className="btn-secondary w-full" disabled={createTeam.isPending}>
            Add team
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4 space-y-2">
          {(runs ?? []).length === 0 && (
            <p className="text-sm text-neutral-400">No runs yet. Create one to start delivering.</p>
          )}
          {(runs ?? []).map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => setSelectedRunId(run.id)}
              className={`w-full rounded-xl border p-4 text-left transition ${
                selectedRunId === run.id ? 'border-primary-300 bg-primary-50' : 'border-neutral-100 bg-surface hover:border-neutral-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-neutral-900">{run.name}</p>
                  <p className="text-xs capitalize text-neutral-500">{run.status.replace('_', ' ')}</p>
                </div>
                <Truck className="h-4 w-4 text-primary-600" />
              </div>
            </button>
          ))}
        </div>
        <div className="lg:col-span-8">
          <RunDetail
            runId={selectedRun?.id ?? null}
            status={selectedRun?.status ?? ''}
            onDelete={async () => {
              if (!selectedRun) return;
              await deleteRun.mutateAsync(selectedRun.id);
              setSelectedRunId(null);
              toast.success('Run deleted');
            }}
            onStatus={async (status) => {
              if (!selectedRun) return;
              const patch =
                status === 'in_progress'
                  ? { status, started_at: new Date().toISOString() }
                  : status === 'completed'
                    ? { status, completed_at: new Date().toISOString() }
                    : { status };
              await updateRun.mutateAsync({ id: selectedRun.id, patch });
            }}
          />
        </div>
      </div>
    </div>
  );
}

function RunDetail({
  runId,
  status,
  onDelete,
  onStatus,
}: {
  runId: string | null;
  status: string;
  onDelete: () => Promise<void>;
  onStatus: (status: 'in_progress' | 'completed') => Promise<void>;
}) {
  const { data: stops } = useDeliveryStops(runId);
  const { data: audit } = useDeliveryAudit(runId);
  const addStop = useAddDeliveryStop();
  const updateStop = useUpdateDeliveryStop();
  const deleteStop = useDeleteDeliveryStop();
  const optimize = useOptimizeRun();

  if (!runId) {
    return (
      <div className="card flex h-64 items-center justify-center text-sm text-neutral-400">
        Select a run to manage stops
      </div>
    );
  }

  const [form, setForm] = useState({
    patient_name: '',
    phone: '',
    address: '',
    city: '',
    postal_code: '',
    rx_notes: '',
    payment_amount_cents: 0,
  });
  const [showAudit, setShowAudit] = useState(false);

  const stats = useMemo(() => {
    const list = stops ?? [];
    return {
      total: list.length,
      delivered: list.filter((s) => s.status === 'delivered').length,
      unpaid: list.filter((s) => s.payment_status === 'unpaid' && s.status === 'delivered').length,
      undeliverable: list.filter((s) => s.status === 'undeliverable' || s.status === 'returned').length,
    };
  }, [stops]);

  const submitStop = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.patient_name.trim() || !form.address.trim()) {
      toast.error('Patient and address are required');
      return;
    }
    try {
      await addStop.mutateAsync({
        run_id: runId,
        sequence: (stops?.length ?? 0),
        patient_name: form.patient_name.trim(),
        phone: form.phone || null,
        address: form.address.trim(),
        city: form.city || null,
        postal_code: form.postal_code || null,
        rx_notes: form.rx_notes || null,
        status: 'pending',
        payment_status: 'unpaid',
        payment_method: null,
        payment_amount_cents: form.payment_amount_cents,
        undeliverable_reason: null,
        delivered_at: null,
      });
      setForm({
        patient_name: '',
        phone: '',
        address: '',
        city: '',
        postal_code: '',
        rx_notes: '',
        payment_amount_cents: 0,
      });
      toast.success('Stop added');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add stop');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="btn-primary"
          disabled={optimize.isPending || !stops?.length}
          onClick={async () => {
            try {
              await optimize.mutateAsync({ runId, stops: stops ?? [] });
              toast.success('Route optimized (nearest-neighbor)');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Optimize failed');
            }
          }}
        >
          {optimize.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
          Optimize route
        </button>
        {status !== 'in_progress' && status !== 'completed' && (
          <button className="btn-secondary" onClick={() => onStatus('in_progress')}>
            <Play className="h-4 w-4" /> Start run
          </button>
        )}
        {status === 'in_progress' && (
          <button className="btn-secondary" onClick={() => onStatus('completed')}>
            <CheckCircle2 className="h-4 w-4" /> Complete run
          </button>
        )}
        <button className="btn-secondary" onClick={() => setShowAudit((v) => !v)}>
          <ScrollText className="h-4 w-4" /> Audit trail
        </button>
        <button className="btn-secondary text-error-600" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <Stat label="Stops" value={stats.total} />
        <Stat label="Delivered" value={stats.delivered} />
        <Stat label="Unpaid" value={stats.unpaid} />
        <Stat label="Failed" value={stats.undeliverable} />
      </div>

      <form onSubmit={submitStop} className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <input className="input-field" placeholder="Patient name" value={form.patient_name} onChange={(e) => setForm((p) => ({ ...p, patient_name: e.target.value }))} />
        <input className="input-field" placeholder="Phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
        <input className="input-field sm:col-span-2" placeholder="Address" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
        <input className="input-field" placeholder="City" value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} />
        <input className="input-field" placeholder="Postal code" value={form.postal_code} onChange={(e) => setForm((p) => ({ ...p, postal_code: e.target.value }))} />
        <input className="input-field sm:col-span-2" placeholder="Rx / package notes" value={form.rx_notes} onChange={(e) => setForm((p) => ({ ...p, rx_notes: e.target.value }))} />
        <input
          type="number"
          min={0}
          step={0.01}
          className="input-field"
          placeholder="Amount due ($)"
          value={form.payment_amount_cents ? form.payment_amount_cents / 100 : ''}
          onChange={(e) =>
            setForm((p) => ({ ...p, payment_amount_cents: Math.round(parseFloat(e.target.value || '0') * 100) }))
          }
        />
        <button className="btn-primary" disabled={addStop.isPending}>
          <Plus className="h-4 w-4" /> Add stop
        </button>
      </form>

      <div className="space-y-3">
        {(stops ?? []).map((stop) => (
          <StopCard
            key={stop.id}
            stop={stop}
            busy={updateStop.isPending}
            onUpdate={(patch, action) => updateStop.mutateAsync({ id: stop.id, runId, patch, action })}
            onDelete={() => deleteStop.mutateAsync({ id: stop.id, runId })}
          />
        ))}
      </div>

      {showAudit && (
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-semibold">Paperless audit trail</h3>
          <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {(audit ?? []).map((e) => (
              <li key={e.id} className="flex justify-between gap-3 border-b border-neutral-50 py-1">
                <span className="font-medium text-neutral-700">{e.action.replace(/_/g, ' ')}</span>
                <span className="text-xs text-neutral-400">{new Date(e.created_at).toLocaleString()}</span>
              </li>
            ))}
            {(audit ?? []).length === 0 && <li className="text-neutral-400">No events yet</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-neutral-50 py-2">
      <p className="text-lg font-semibold text-neutral-900">{value}</p>
      <p className="text-neutral-500">{label}</p>
    </div>
  );
}

function StopCard({
  stop,
  busy,
  onUpdate,
  onDelete,
}: {
  stop: DeliveryStop;
  busy: boolean;
  onUpdate: (patch: Partial<DeliveryStop>, action?: string) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}) {
  const [method, setMethod] = useState<PaymentMethod>('square');
  const [reason, setReason] = useState('');

  const setStatus = async (status: DeliveryStopStatus, extra: Partial<DeliveryStop> = {}, action?: string) => {
    try {
      await onUpdate(
        {
          status,
          delivered_at: status === 'delivered' ? new Date().toISOString() : stop.delivered_at,
          ...extra,
        },
        action ?? `status_${status}`
      );
      toast.success('Stop updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-primary-600">Stop {stop.sequence + 1}</p>
          <p className="font-semibold text-neutral-900">{stop.patient_name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-neutral-600">
            <MapPin className="h-3.5 w-3.5" />
            {stop.address}
            {stop.city ? `, ${stop.city}` : ''}
            {stop.postal_code ? ` ${stop.postal_code}` : ''}
          </p>
          {stop.rx_notes && <p className="mt-1 text-xs text-neutral-500">{stop.rx_notes}</p>}
        </div>
        <div className="text-right">
          <span className="inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-xs capitalize">{stop.status.replace('_', ' ')}</span>
          <p className="mt-1 text-sm font-medium">{formatMoney(stop.payment_amount_cents)}</p>
          <p className="text-xs capitalize text-neutral-400">{stop.payment_status}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-secondary text-xs" disabled={busy} onClick={() => setStatus('in_transit')}>
          In transit
        </button>
        <button className="btn-secondary text-xs" disabled={busy} onClick={() => setStatus('delivered')}>
          Delivered
        </button>
        <button
          className="btn-secondary text-xs"
          disabled={busy}
          onClick={() =>
            setStatus(
              'delivered',
              { payment_status: 'collected', payment_method: method },
              'payment_collected'
            )
          }
        >
          <CreditCard className="h-3 w-3" /> Collect ({method})
        </button>
        <select className="rounded-lg border border-neutral-200 px-2 py-1 text-xs" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          <option value="square">Square</option>
          <option value="card">Card</option>
          <option value="cash">Cash</option>
          <option value="other">Other</option>
        </select>
        <button className="btn-secondary text-xs" disabled={busy} onClick={() => setStatus('rescheduled')}>
          <RotateCcw className="h-3 w-3" /> Reschedule
        </button>
        <button
          className="btn-secondary text-xs"
          disabled={busy}
          onClick={() => setStatus('undeliverable', { undeliverable_reason: reason || 'Nobody home' }, 'undeliverable')}
        >
          <PackageX className="h-3 w-3" /> Nobody home
        </button>
        <button className="btn-secondary text-xs" disabled={busy} onClick={() => setStatus('returned', { undeliverable_reason: 'Returned to inventory' })}>
          Return to inventory
        </button>
        <input
          className="input-field max-w-[180px] py-1 text-xs"
          placeholder="Undeliverable reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button className="btn-secondary text-xs text-error-600" onClick={() => onDelete()}>
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
