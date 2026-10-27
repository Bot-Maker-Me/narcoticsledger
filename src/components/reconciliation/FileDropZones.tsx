import { useRef, type DragEvent } from 'react';
import { FileSpreadsheet, CheckCircle2, X } from 'lucide-react';

export interface DropZoneProps {
  label: string;
  description: string;
  icon: typeof FileSpreadsheet;
  file: File | null;
  dragOver: boolean;
  accept: string;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}

/** Single-file drop zone used for the optional saved-count file. */
export function DropZone(props: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = props.icon;

  return (
    <div
      onDrop={props.onDrop}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onClick={() => inputRef.current?.click()}
      className={`card relative flex cursor-pointer flex-col items-center justify-center p-8 transition-all duration-200 ${
        props.dragOver
          ? 'border-2 border-primary-400 bg-primary-50/30 scale-[1.02]'
          : 'border-2 border-dashed border-neutral-200 hover:border-primary-300 hover:bg-primary-50/20'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={props.accept}
        className="hidden"
        onChange={props.onFileSelect}
      />

      {props.file ? (
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-50">
              <CheckCircle2 className="h-5 w-5 text-success-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-800">{props.file.name}</p>
              <p className="text-xs text-neutral-400">{(props.file.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              props.onClear();
            }}
            className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-xl transition-colors ${
              props.dragOver ? 'bg-primary-100' : 'bg-neutral-100'
            }`}
          >
            <Icon className={`h-7 w-7 ${props.dragOver ? 'text-primary-600' : 'text-neutral-400'}`} />
          </div>
          <p className="mt-4 text-sm font-semibold text-neutral-700">{props.label}</p>
          <p className="mt-1 text-xs text-neutral-400">{props.description}</p>
          <p className="mt-2 text-xs text-neutral-500">Drag & drop or click to browse</p>
        </>
      )}
    </div>
  );
}

export function MultiFileDropZone({
  label,
  description,
  icon: Icon,
  files,
  dragOver,
  accept,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileSelect,
  onRemoveFile,
  onClearAll,
}: {
  label: string;
  description: string;
  icon: any;
  files: File[];
  dragOver: boolean;
  accept: string;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
  onClearAll: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
      className={`card relative flex cursor-pointer flex-col p-6 transition-all duration-200 ${
        dragOver
          ? 'border-2 border-primary-400 bg-primary-50/30 scale-[1.02]'
          : 'border-2 border-dashed border-neutral-200 hover:border-primary-300 hover:bg-primary-50/20'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={onFileSelect}
      />

      <div className="flex flex-col">
        <div className="flex flex-col items-center text-center mb-4">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-xl transition-colors ${
              dragOver ? 'bg-primary-100' : 'bg-neutral-100'
            }`}
          >
            <Icon className={`h-7 w-7 ${dragOver ? 'text-primary-600' : 'text-neutral-400'}`} />
          </div>
          <p className="mt-4 text-sm font-semibold text-neutral-700">{label}</p>
          <p className="mt-1 text-xs text-neutral-400">{description}</p>
          <p className="mt-2 text-xs text-neutral-500">Drag & drop or click to browse (multiple files allowed)</p>
        </div>

        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-700">{files.length} file(s) uploaded</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClearAll();
                }}
                className="text-xs text-error-600 hover:text-error-700"
              >
                Clear all
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between bg-neutral-50 rounded px-2 py-1"
                >
                  <span className="text-xs text-neutral-600 truncate flex-1">{file.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFile(index);
                    }}
                    className="text-neutral-400 hover:text-error-600 ml-2"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
