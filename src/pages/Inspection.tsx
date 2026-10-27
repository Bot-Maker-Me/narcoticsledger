import { useMemo, useState } from 'react';
import { Search, Shield } from 'lucide-react';
import { useReconciliationCycles, useReconciliationItems } from '@/hooks/useReconciliation';
import { useAllReconciliationItems } from '@/hooks/useReconciliation';

export default function Inspection() {
  const { data: cycles } = useReconciliationCycles();
  const { data: allItems } = useAllReconciliationItems();
  const completed = (cycles ?? []).filter((c) => c.status === 'completed');
  const [cycleId, setCycleId] = useState<string | null>(completed[0]?.id ?? null);
  const [din, setDin] = useState('');
  const { data: items } = useReconciliationItems(cycleId);

  const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const nearby = useMemo(() => {
    if (!din.trim()) return [];
    return (allItems ?? []).filter(
      (i) => i.din.includes(din.trim()) && new Date(i.created_at).getTime() >= twoDaysAgo
    );
  }, [allItems, din, twoDaysAgo]);

  const dueSoon = useMemo(() => {
    const lastByDin = new Map<string, Date>();
    (allItems ?? []).forEach((i) => {
      if (i.cycle_status !== 'completed') return;
      const d = new Date(i.cycle_created_at);
      const prev = lastByDin.get(i.din);
      if (!prev || d > prev) lastByDin.set(i.din, d);
    });
    const now = Date.now();
    return [...lastByDin.entries()]
      .map(([itemDin, last]) => ({
        din: itemDin,
        last,
        days: Math.floor((now - last.getTime()) / 86400000),
      }))
      .filter((x) => x.days >= 25)
      .sort((a, b) => b.days - a.days)
      .slice(0, 20);
  }, [allItems]);

  return (
    <div>
      <h1 className="font-display text-3xl text-neutral-900">Inspection Spot Check</h1>
      <p className="mt-1 mb-6 text-sm text-neutral-500">
        Pull any past reconciliation in seconds, and investigate records within two days of the last count.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-4 lg:col-span-1">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4 text-primary-600" /> Due for count
          </h2>
          <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
            {dueSoon.map((d) => (
              <li key={d.din} className="flex justify-between">
                <span className="font-mono">{d.din}</span>
                <span className="text-warning-700">{d.days}d ago</span>
              </li>
            ))}
            {dueSoon.length === 0 && <li className="text-neutral-400">No overdue DINs yet</li>}
          </ul>
        </div>
        <div className="card p-4 lg:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-neutral-600">Completed cycle</label>
          <select
            className="input-field mb-4"
            value={cycleId ?? ''}
            onChange={(e) => setCycleId(e.target.value || null)}
          >
            <option value="">Select a cycle</option>
            {completed.map((c) => (
              <option key={c.id} value={c.id}>
                {formatDate(c.created_at)} · {c.performed_by || 'Unknown'}
              </option>
            ))}
          </select>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-neutral-500">
                <tr>
                  <th className="py-2">DIN</th>
                  <th>Expected</th>
                  <th>Actual</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((i) => {
                  const expected = i.opening_balance + i.purchased_count - i.dispensed_count;
                  return (
                    <tr key={i.id} className="border-t border-neutral-50">
                      <td className="py-2 font-mono text-xs">{i.din}</td>
                      <td>{expected}</td>
                      <td>{i.actual_count ?? '—'}</td>
                      <td>{i.flag}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold">Investigate by DIN (last 2 days of counts)</h2>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-900/[0.4]" />
          <input className="input-field pl-10" placeholder="Enter DIN" value={din} onChange={(e) => setDin(e.target.value)} />
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          {nearby.map((i) => (
            <li key={i.id} className="rounded-lg bg-neutral-50 px-3 py-2">
              <span className="font-mono">{i.din}</span> · actual {i.actual_count ?? '—'} · {i.flag} ·{' '}
              {new Date(i.created_at).toLocaleString()}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString();
}
