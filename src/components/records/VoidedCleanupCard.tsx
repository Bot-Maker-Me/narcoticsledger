import { useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronDown, FileText, Loader2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import SectionMarker from '@/components/SectionMarker';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import {
  NO_FILE_KEY,
  usePurgeVoidedRecords,
  useVoidedSummary,
  type PurgeScope,
  type VoidedGroup,
  type VoidedGroupBy,
} from '@/hooks/useVoidedCleanup';
import { formatDate, formatMonthYear } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { getErrorMessage } from '@/lib/errors';
import type { TransactionType } from '@/types/transaction';

const KIND_LABEL: Record<TransactionType, string> = {
  PURCHASE: 'Purchase',
  DISPENSE: 'Dispense',
  ADJUSTMENT: 'Adjustment',
};

/** Imports made before file names were stored have no name to show. */
const NO_FILE_LABEL = 'No file name (older imports)';

const HEADER_CELL =
  'px-5 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500';

const PURGE_BUTTON =
  'flex items-center gap-1.5 rounded-lg border border-primary-400/60 px-3 py-1.5 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50';

function groupLabel(group: VoidedGroup, groupBy: VoidedGroupBy): string {
  if (groupBy === 'month') {
    // `formatMonthYear` needs a calendar day: "2026-02" would be read as UTC and could
    // land in January for anyone west of UTC.
    return formatMonthYear(`${group.bucketKey}-01`);
  }
  return group.bucketKey === NO_FILE_KEY ? NO_FILE_LABEL : group.bucketKey;
}

function scopeFor(group: VoidedGroup, groupBy: VoidedGroupBy): PurgeScope {
  return groupBy === 'month' ? { month: group.bucketKey } : { fileName: group.bucketKey };
}

/**
 * Permanent cleanup of voided ledger rows.
 *
 * Voiding (deleting an imported file) only marks rows, because the ledger is append-only
 * and the audit trail has to survive. Repeated re-imports therefore leave the voided rows
 * behind for good, which is why this card can remove them - by month of the transaction,
 * by file, or all at once. Every purge is written to `audit_logs` by the database, and no
 * live row can ever be purged.
 */
export default function VoidedCleanupCard() {
  const [groupBy, setGroupBy] = useState<VoidedGroupBy>('month');
  const [open, setOpen] = useState(false);
  const { data: groups, isLoading, isError, error, refetch } = useVoidedSummary(groupBy);
  const purge = usePurgeVoidedRecords();
  const confirm = useConfirm();

  const total = (groups ?? []).reduce((sum, group) => sum + group.rowCount, 0);

  async function purgeScope(scope: PurgeScope, what: string) {
    const confirmed = await confirm({
      title: 'Delete these voided rows for good?',
      description: `${what} This cannot be undone. The rows are removed from the database and the audit log records the purge; live ledger rows are never touched.`,
      confirmLabel: 'Delete permanently',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      const rows = await purge.mutateAsync(scope);
      toast.success(
        `${formatNumber(rows)} voided row${rows === 1 ? '' : 's'} deleted permanently`
      );
    } catch (purgeError) {
      toast.error(getErrorMessage(purgeError));
    }
  }

  if (isLoading && !groups) return null;

  if (isError) {
    return (
      <section className="card mt-6 p-5">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-error-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-neutral-700">Could not load the voided records</p>
            <p className="mt-0.5 text-xs text-neutral-500">{getErrorMessage(error)}</p>
          </div>
          <button onClick={() => refetch()} className="btn-secondary text-xs">
            Try again
          </button>
        </div>
      </section>
    );
  }

  // Nothing has been voided, so there is nothing to clean up.
  if (!groups || groups.length === 0) return null;

  return (
    <section className="card mt-6 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <SectionMarker index="02" label="Voided records" />
          <p className="mt-3 text-sm text-neutral-700">
            {formatNumber(total)} voided row{total === 1 ? '' : 's'} are still stored in the ledger.
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Voided rows keep a deleted import in the audit trail and never count towards stock.
            Removing them is permanent, and only voided rows can be removed.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {purge.isPending && <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />}
          <button
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="btn-secondary text-xs"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            {open ? 'Hide breakdown' : 'Review & clean up'}
          </button>
          <button
            onClick={() =>
              purgeScope({ all: true }, `Every voided row you have (${formatNumber(total)}).`)
            }
            disabled={purge.isPending}
            className={PURGE_BUTTON}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Purge all
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/5">
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">
              Group by
            </span>
            <button
              onClick={() => setGroupBy('month')}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                groupBy === 'month'
                  ? 'border-primary-400 bg-primary-50 text-primary-700'
                  : 'border-white/15 bg-white/5 text-neutral-600 hover:bg-white/10 hover:text-neutral-900'
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Month
            </button>
            <button
              onClick={() => setGroupBy('file')}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                groupBy === 'file'
                  ? 'border-primary-400 bg-primary-50 text-primary-700'
                  : 'border-white/15 bg-white/5 text-neutral-600 hover:bg-white/10 hover:text-neutral-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              File
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-y border-white/5 bg-neutral-50/50">
                  <th className={`${HEADER_CELL} text-left`}>
                    {groupBy === 'month' ? 'Month' : 'File'}
                  </th>
                  <th className={`${HEADER_CELL} text-left`}>Type</th>
                  <th className={`${HEADER_CELL} text-right`}>Voided rows</th>
                  <th className={HEADER_CELL} />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {groups.map((group) => {
                  const label = groupLabel(group, groupBy);
                  return (
                    <tr key={group.bucketKey} className="transition-colors hover:bg-white/5">
                      <td className="px-5 py-3">
                        <p className="max-w-md truncate text-sm text-neutral-800">{label}</p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {formatDate(group.firstDate)} – {formatDate(group.lastDate)}
                          {group.lastVoided && ` · voided ${formatDate(group.lastVoided)}`}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {group.kinds.map((kind) => (
                            <span
                              key={kind}
                              className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600"
                            >
                              {KIND_LABEL[kind] ?? kind}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right text-sm text-neutral-700">
                        {formatNumber(group.rowCount)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() =>
                            purgeScope(
                              scopeFor(group, groupBy),
                              `${label} — ${formatNumber(group.rowCount)} voided rows.`
                            )
                          }
                          disabled={purge.isPending}
                          className={PURGE_BUTTON}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Purge
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
