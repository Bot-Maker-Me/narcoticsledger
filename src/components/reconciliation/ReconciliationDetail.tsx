import { ChevronLeft, CheckCircle2, Loader2 } from 'lucide-react';
import type { ReconciliationFlag } from '@/types/reconciliation';
import { flagStyles } from '@/components/reconciliation/shared';

interface SavedItem {
  id: string;
  din: string;
  description: string | null;
  schedule: string | null;
  opening_balance: number;
  purchased_count: number;
  dispensed_count: number;
  actual_count: number | null;
  flag: string;
}

export interface DetailViewProps {
  items: SavedItem[];
  onActualCountBlur: (itemId: string, value: string) => void;
  onOpeningBlur: (itemId: string, value: string) => void;
  onComplete: () => void;
  onBack: () => void;
  completing: boolean;
  updating: boolean;
}

export function DetailView(props: DetailViewProps) {
  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-neutral-900">Reconciliation Detail</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {props.items.length} items · Enter actual counts, then complete the cycle
          </p>
        </div>
        <div className="flex gap-2 mt-4 sm:mt-0">
          <button className="btn-secondary" onClick={props.onBack}>
            <ChevronLeft className="h-4 w-4" />
            Back to Cycles
          </button>
          <button className="btn-primary" onClick={props.onComplete} disabled={props.completing}>
            {props.completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {props.completing ? 'Completing...' : 'Complete Cycle'}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/50">
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">DIN</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Description</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Opening</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Purchased</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Dispensed</th>
                <th
                  className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-primary-600"
                  title="Total units for this DIN (Opening + Purchased − Dispensed)"
                >
                  Total
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Expected</th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">Actual</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Variance</th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">Flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {props.items.map((item) => {
                const expected = item.opening_balance + item.purchased_count - item.dispensed_count;
                const variance = item.actual_count !== null ? item.actual_count - expected : null;
                return (
                  <tr key={item.id} className="transition-colors hover:bg-neutral-50/50">
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs font-medium text-neutral-700">{item.din}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-sm text-neutral-700">{item.description ?? 'Unknown'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <input
                        type="number"
                        min={0}
                        defaultValue={item.opening_balance}
                        onBlur={(e) => props.onOpeningBlur(item.id, e.target.value)}
                        title="Opening count — editable"
                        className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-center text-sm text-neutral-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm text-success-600">+{item.purchased_count}</td>
                    <td className="px-3 py-2.5 text-right text-sm text-error-600">-{item.dispensed_count}</td>
                    <td
                      className="px-3 py-2.5 text-right text-sm font-semibold text-primary-700 bg-primary-50/40"
                      title="Total units for this DIN (Opening + Purchased − Dispensed)"
                    >
                      {expected}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm font-semibold text-neutral-700">{expected}</td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        min={0}
                        defaultValue={item.actual_count ?? ''}
                        onBlur={(e) => props.onActualCountBlur(item.id, e.target.value)}
                        placeholder="—"
                        className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-center text-sm text-neutral-800 placeholder:text-neutral-300 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {variance === null ? (
                        <span className="text-sm text-neutral-500">—</span>
                      ) : (
                        <span className={`text-sm font-semibold ${variance === 0 ? 'text-success-600' : variance < 0 ? 'text-error-600' : 'text-warning-600'}`}>
                          {variance > 0 ? '+' : ''}{variance}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${flagStyles[item.flag as ReconciliationFlag] ?? 'bg-neutral-100 text-neutral-500'}`}>
                        {item.flag}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
