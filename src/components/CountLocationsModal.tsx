import { useState } from 'react';
import { MapPin, X } from 'lucide-react';
import type { CountLocation, ReconciliationItemDraft } from '@/types/reconciliation';
import { DEFAULT_COUNT_LOCATIONS } from '@/types/reconciliation';
import { computeFlag } from '@/hooks/useReconciliation';

export default function CountLocationsModal({
  item,
  onSave,
  onClose,
}: {
  item: ReconciliationItemDraft;
  onSave: (locations: CountLocation[], total: number) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<CountLocation[]>(
    item.locations && item.locations.length > 0 ? item.locations : DEFAULT_COUNT_LOCATIONS.map((l) => ({ ...l }))
  );
  const [newName, setNewName] = useState('');

  const total = rows.reduce((sum, r) => sum + (r.count ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/80" onClick={onClose} />
      <div className="card relative z-10 w-full max-w-md p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <MapPin className="h-4 w-4 text-primary-600" /> Count locations · {item.din}
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-xs text-neutral-500">Split shelf, blister, and pouch counts. Total becomes the actual count.</p>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={`${row.name}-${i}`} className="flex gap-2">
              <input
                className="input-field"
                value={row.name}
                onChange={(e) =>
                  setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, name: e.target.value } : r)))
                }
              />
              <input
                type="number"
                min={0}
                className="input-field w-24"
                value={row.count ?? ''}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, idx) => (idx === i ? { ...r, count: e.target.value === '' ? null : parseInt(e.target.value) } : r))
                  )
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input className="input-field" placeholder="Add location" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button
            className="btn-secondary"
            type="button"
            onClick={() => {
              if (!newName.trim()) return;
              setRows((p) => [...p, { name: newName.trim(), count: null }]);
              setNewName('');
            }}
          >
            Add
          </button>
        </div>
        <p className="mt-3 text-sm font-medium">Total: {total}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => {
              const expected = item.opening_balance + item.purchased_count - item.dispensed_count;
              void computeFlag(total, expected, item.schedule);
              onSave(rows, total);
            }}
          >
            Apply total
          </button>
        </div>
      </div>
    </div>
  );
}
