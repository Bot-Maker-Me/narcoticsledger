import { useRef, type ChangeEvent, type DragEvent } from 'react';
import { CheckCircle2, FileSpreadsheet, Loader2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatBytes } from '@/lib/format';

export interface DropZoneProps {
  label: string;
  description: string;
  icon?: LucideIcon;
  files: File[];
  dragOver: boolean;
  accept?: string;
  /** Allow picking several files at once. Defaults to true. */
  multiple?: boolean;
  /** Small print under the description, e.g. "Drag & drop or click to browse". */
  hint?: string;
  /** True while the selected files are still being read in the background. */
  preparing?: boolean;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
  onClearAll: () => void;
}

/**
 * The single drop zone used everywhere a file is uploaded.
 *
 * Three near-identical copies used to exist (reconciliation's pair, the record import
 * page and the upload page). They now share this component, so the drag styling, the
 * file list and the accessibility behaviour only have to be right once.
 */
export default function DropZone({
  label,
  description,
  icon: Icon = FileSpreadsheet,
  files,
  dragOver,
  accept = '.csv,.xlsx,.xls',
  multiple = true,
  hint,
  preparing = false,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileSelect,
  onRemoveFile,
  onClearAll,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
      className={`card relative flex cursor-pointer flex-col items-center justify-center p-8 transition-all duration-200 ${
        dragOver
          ? 'scale-[1.02] border-2 border-primary-400 bg-primary-50/30'
          : 'border-2 border-dashed border-neutral-200 hover:border-primary-300 hover:bg-primary-50/20'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={onFileSelect}
      />

      {files.length === 0 ? (
        <>
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-xl transition-colors ${
              dragOver ? 'bg-primary-100' : 'bg-neutral-100'
            }`}
          >
            <Icon className={`h-7 w-7 ${dragOver ? 'text-primary-600' : 'text-neutral-400'}`} />
          </div>
          <p className="mt-4 text-sm font-semibold text-neutral-700">{label}</p>
          <p className="mt-1 text-center text-xs text-neutral-400">{description}</p>
          <p className="mt-2 text-xs text-neutral-500">
            {hint ?? `Drag & drop or click to browse${multiple ? ' (multiple files allowed)' : ''}`}
          </p>
        </>
      ) : (
        <div className="w-full">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-700">
              {files.length} file{files.length === 1 ? '' : 's'} selected
            </p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onClearAll();
              }}
              className="text-xs text-neutral-400 transition-colors hover:text-neutral-700"
            >
              Clear all
            </button>
          </div>

          <div className="max-h-40 space-y-2 overflow-y-auto">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success-600" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-neutral-800">{file.name}</p>
                    <p className="text-xs text-neutral-400">{formatBytes(file.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveFile(index);
                  }}
                  className="ml-2 rounded p-1 text-neutral-400 transition-colors hover:bg-white/10 hover:text-error-600"
                  title="Remove file"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {preparing && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-neutral-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Reading file… a 10 MB export takes a few seconds
            </p>
          )}
        </div>
      )}
    </div>
  );
}
