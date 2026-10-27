import { Loader2, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ImportedRecordRow } from '@/hooks/useImportedRecords';
import { formatLedgerDate } from '@/lib/ledgerDate';

interface FileGroupTableProps {
  fileName: string;
  /** Rows to render (already limited by the caller). */
  records: ImportedRecordRow[];
  /** Rows in the whole file, used for the count and the "+N more" row. */
  totalRows: number;
  quantityLabel: string;
  icon: LucideIcon;
  /** Bound the table height and keep its header sticky (used by the full browser). */
  scrollable?: boolean;
  onDelete: () => void;
  deleting?: boolean;
}

const HEADER_CELL =
  'sticky top-0 z-10 border-b border-white/10 bg-ink-900 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500';

/** One uploaded file's records, as a titled table. */
export default function FileGroupTable({
  fileName,
  records,
  totalRows,
  quantityLabel,
  icon: Icon,
  scrollable = false,
  onDelete,
  deleting = false,
}: FileGroupTableProps) {
  const hidden = totalRows - records.length;

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <div className="flex items-center justify-between border-b border-white/5 bg-ink-850 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-primary-500" />
          <span className="truncate text-sm font-medium text-neutral-800">{fileName}</span>
          <span className="shrink-0 text-xs text-neutral-500">
            ({totalRows} row{totalRows === 1 ? '' : 's'})
          </span>
        </div>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-error-50 hover:text-error-600 disabled:opacity-50"
          title="Delete all records from this file"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>

      <div className={scrollable ? 'max-h-[70vh] overflow-auto' : 'overflow-x-auto'}>
        <table className="w-full">
          <thead>
            <tr>
              <th className={`${HEADER_CELL} text-left`}>DIN</th>
              <th className={`${HEADER_CELL} text-left`}>Description</th>
              <th className={`${HEADER_CELL} text-right`}>{quantityLabel}</th>
              <th className={`${HEADER_CELL} text-right`}>Date</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-b border-white/5 transition-colors hover:bg-white/5">
                <td className="px-4 py-3 font-mono text-sm text-neutral-800">{record.din}</td>
                <td className="px-4 py-3 text-sm text-neutral-600">{record.description}</td>
                <td className="px-4 py-3 text-right text-sm text-neutral-600">{record.quantity}</td>
                <td className="px-4 py-3 text-right text-xs text-neutral-400">
                  {formatLedgerDate(record.created_at)}
                </td>
              </tr>
            ))}
            {hidden > 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-2 text-center text-xs text-neutral-400">
                  +{hidden} more row{hidden === 1 ? '' : 's'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
