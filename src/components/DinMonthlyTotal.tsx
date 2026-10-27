import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Hash, X } from 'lucide-react';
import { isSameDin } from '@/lib/dinReference';
import { ledgerMonthKey } from '@/lib/ledgerDate';
import type { ImportedRecordRow } from '@/hooks/useImportedRecords';

interface DinMonthlyTotalProps {
  records: ImportedRecordRow[] | undefined;
  loading?: boolean;
  /** Verb used in the summary, e.g. "Purchased" or "Dispensed". */
  label: string;
}

function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Paste a DIN and read the total quantity recorded for that drug in a single month.
 */
export default function DinMonthlyTotal({ records, loading, label }: DinMonthlyTotalProps) {
  const [din, setDin] = useState('');
  const [month, setMonth] = useState(() => ledgerMonthKey(new Date().toISOString()));

  const digits = din.replace(/\D/g, '');
  const ready = digits.length >= 6;

  const matches = useMemo(() => {
    if (!records || !ready) return [];
    return records.filter(
      (record) => isSameDin(record.din, din) && ledgerMonthKey(record.created_at) === month
    );
  }, [records, din, month, ready]);

  const total = matches.reduce((sum, record) => sum + record.quantity, 0);
  const description = matches.find(
    (record) => record.description && record.description !== 'Unknown'
  )?.description;

  return (
    <div className="mb-6 card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-neutral-800">
          <Hash className="h-4 w-4 text-primary-600" />
          Monthly total for a DIN
        </span>

        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            value={din}
            onChange={(e) => setDin(e.target.value)}
            placeholder="Paste a DIN, e.g. 02266687"
            className="input-field w-56 font-mono"
          />
          {din && (
            <button
              type="button"
              onClick={() => setDin('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
              title="Clear DIN"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth((current) => shiftMonth(current, -1))}
            className="rounded-lg border border-neutral-200 p-2 text-neutral-500 transition-colors hover:bg-neutral-50"
            title="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="input-field w-40"
          />
          <button
            type="button"
            onClick={() => setMonth((current) => shiftMonth(current, 1))}
            className="rounded-lg border border-neutral-200 p-2 text-neutral-500 transition-colors hover:bg-neutral-50"
            title="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4">
        {!ready ? (
          <p className="text-sm text-neutral-500">
            Paste a DIN to see how many units were {label.toLowerCase()} in a month.
          </p>
        ) : loading ? (
          <p className="text-sm text-neutral-500">Loading records…</p>
        ) : matches.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No {label.toLowerCase()} records for DIN {din.trim()} in {monthLabel(month)}.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="text-3xl font-bold text-neutral-900">{total.toLocaleString()}</p>
              <p className="text-sm text-neutral-500">
                units {label.toLowerCase()} in {monthLabel(month)}
              </p>
            </div>
            <div className="text-xs text-neutral-500">
              <p>
                {matches.length} {matches.length === 1 ? 'entry' : 'entries'}
              </p>
              {description && <p className="mt-1 text-sm text-neutral-700">{description}</p>}
              <p className="mt-1 font-mono text-neutral-400">DIN {matches[0].din}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
