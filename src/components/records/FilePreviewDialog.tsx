import { CheckCircle2, X } from 'lucide-react';
import type { FilePreview } from '@/lib/fileParser';
import { formatBytes } from '@/lib/format';

interface FilePreviewDialogProps {
  previews: FilePreview[];
  title?: string;
  /** Summary line under the title, e.g. "412 rows ready to save". */
  summary: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Review step shown after files are parsed.
 *
 * The reconciliation import and both record-import flows each rendered their own copy of
 * this dialog; they now share one so the preview reads the same everywhere.
 */
export default function FilePreviewDialog({
  previews,
  title = 'File Processing Preview',
  summary,
  confirmLabel = 'Continue',
  onConfirm,
  onCancel,
}: FilePreviewDialogProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-ink-950/80 backdrop-blur-sm" onClick={onCancel} />

      <div className="card relative z-[10000] max-h-[90vh] w-full max-w-3xl animate-slide-up overflow-y-auto p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">{title}</h2>
            <p className="mt-1 text-sm text-neutral-500">{summary}</p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-700"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {previews.map((preview, index) => (
            <div key={`${preview.fileName}-${index}`} className="rounded-lg border border-white/10 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-neutral-800">{preview.fileName}</span>
                <span className="shrink-0 text-xs font-medium uppercase text-neutral-500">
                  {preview.format} · {preview.totalRows} rows · {formatBytes(preview.fileSize)}
                </span>
              </div>

              {preview.dateRange?.start && preview.dateRange?.end && (
                <p className="text-xs text-neutral-500">
                  Date range: {preview.dateRange.start.toLocaleDateString()} –{' '}
                  {preview.dateRange.end.toLocaleDateString()}
                </p>
              )}

              {preview.sampleData.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/10">
                        {Object.keys(preview.sampleData[0]).map((key) => (
                          <th key={key} className="px-2 py-1 text-left font-medium text-neutral-500">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sampleData.slice(0, 3).map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-b border-white/5">
                          {Object.values(row).map((value, cellIndex) => (
                            <td key={cellIndex} className="px-2 py-1 text-neutral-600">
                              {String(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-primary">
            <CheckCircle2 className="h-4 w-4" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
