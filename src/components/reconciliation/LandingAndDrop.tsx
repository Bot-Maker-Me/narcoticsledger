import { useRef, type DragEvent } from 'react';
import {
  Scale,
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  History,
  Search,
  Edit3,
  Check,
  Undo,
  Redo,
  MapPin,
  FileDown,
  Download,
  X,
  Trash2,
} from 'lucide-react';
import type {
  ReconciliationItemDraft,
  ReconciliationFlag,
  CycleFormData,
  CountLocation,
  ReconChecklist,
} from '@/types/reconciliation';
import type { FilePreview } from '@/lib/fileParser';
import CountLocationsModal from '@/components/CountLocationsModal';
import { motion, AnimatePresence } from 'framer-motion';
import { flagStyles, formatDate } from './shared';

// =================== LANDING VIEW ===================

interface LandingViewProps {
  mckessonFiles: File[];
  krollFiles: File[];
  mckessonDragOver: boolean;
  krollDragOver: boolean;
  parsing: boolean;
  cycles: { id: string; status: string; created_at: string }[];
  cyclesLoading: boolean;
  startFromPreviousMode: 'database' | 'file' | 'zero';
  savedCountFile: File | null;
  savedCountDragOver: boolean;
  hasExistingData: boolean;
  onDrop: (e: DragEvent<HTMLDivElement>, zone: 'mckesson' | 'kroll') => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, zone: 'mckesson' | 'kroll') => void;
  onDragLeave: (zone: 'mckesson' | 'kroll') => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>, zone: 'mckesson' | 'kroll') => void;
  onRemoveFile: (index: number, zone: 'mckesson' | 'kroll') => void;
  onClearAllFiles: (zone: 'mckesson' | 'kroll') => void;
  onSavedCountDrop: (e: DragEvent<HTMLDivElement>) => void;
  onSavedCountDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onSavedCountDragLeave: () => void;
  onSavedCountSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onParseSavedCount: () => void;
  onProcess: () => void;
  onViewPast: () => void;
  onClearAll: () => void;
  onStartFromPreviousModeChange: (mode: 'database' | 'file' | 'zero') => void;
}

export function LandingView(props: LandingViewProps) {
  const completedCount = props.cycles.filter((c) => c.status === 'completed').length;
  const inProgressCount = props.cycles.filter((c) => c.status === 'in_progress').length;

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Reconciliation</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Import pharmacy exports to start a reconciliation cycle
          </p>
        </div>
        <button className="btn-secondary mt-4 sm:mt-0" onClick={props.onViewPast}>
          <History className="h-4 w-4" />
          View Past Cycles
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-50">
            <CheckCircle2 className="h-5 w-5 text-success-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-neutral-900">{completedCount}</p>
          <p className="text-sm text-neutral-500">Completed Cycles</p>
        </div>
        <div className="card p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-50">
            <Scale className="h-5 w-5 text-warning-600" />
          </div>
          <p className="mt-3 text-2xl font-bold text-neutral-900">{inProgressCount}</p>
          <p className="text-sm text-neutral-500">In Progress</p>
        </div>
      </div>

      {props.hasExistingData && (
        <div className="mb-6 card p-4 bg-primary-50 border-primary-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-primary-600" />
              <div>
                <p className="text-sm font-medium text-primary-900">Existing data detected</p>
                <p className="text-xs text-primary-700">New uploads will be deduplicated against existing data to prevent duplicates.</p>
              </div>
            </div>
            <button
              onClick={props.onClearAll}
              className="text-sm text-primary-700 hover:text-primary-900 font-medium"
            >
              Clear all data
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 card p-6">
        <h3 className="mb-4 text-lg font-semibold text-neutral-900">Starting Count Option</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="startOption"
              checked={props.startFromPreviousMode === 'zero'}
              onChange={() => props.onStartFromPreviousModeChange('zero')}
              className="h-4 w-4 text-primary-600"
            />
            <span className="text-sm text-neutral-700">Start from zero</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="startOption"
              checked={props.startFromPreviousMode === 'database'}
              onChange={() => props.onStartFromPreviousModeChange('database')}
              className="h-4 w-4 text-primary-600"
            />
            <span className="text-sm text-neutral-700">Start from previous saved counts (from database)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="startOption"
              checked={props.startFromPreviousMode === 'file'}
              onChange={() => props.onStartFromPreviousModeChange('file')}
              className="h-4 w-4 text-primary-600"
            />
            <span className="text-sm text-neutral-700">Start from saved counts file</span>
          </label>
        </div>

        {props.startFromPreviousMode === 'file' && (
          <div className="mt-4">
            <DropZone
              label="Saved Count File"
              description="Upload a file with DIN and actual count columns (.csv, .xlsx, .xls)"
              icon={FileSpreadsheet}
              file={props.savedCountFile}
              dragOver={props.savedCountDragOver}
              accept=".csv,.xlsx,.xls"
              onDrop={props.onSavedCountDrop}
              onDragOver={props.onSavedCountDragOver}
              onDragLeave={props.onSavedCountDragLeave}
              onFileSelect={props.onSavedCountSelect}
              onClear={() => {}}
            />
          </div>
        )}
      </div>

      <div className="mb-6 card p-6">
        <h3 className="mb-4 text-lg font-semibold text-neutral-900">File Uploads</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <MultiFileDropZone
            label="McKesson Exports"
            description="Upload one or more McKesson purchase reports (.csv, .xlsx, .xls)"
            icon={FileSpreadsheet}
            files={props.mckessonFiles}
            dragOver={props.mckessonDragOver}
            accept=".csv,.xlsx,.xls"
            onDrop={(e) => props.onDrop(e, 'mckesson')}
            onDragOver={(e) => props.onDragOver(e, 'mckesson')}
            onDragLeave={() => props.onDragLeave('mckesson')}
            onFileSelect={(e) => props.onFileSelect(e, 'mckesson')}
            onRemoveFile={(index) => props.onRemoveFile(index, 'mckesson')}
            onClearAll={() => props.onClearAllFiles('mckesson')}
          />
          <MultiFileDropZone
            label="Kroll Exports"
            description="Upload one or more Kroll dispensing reports (.csv, .xlsx, .xls)"
            icon={FileText}
            files={props.krollFiles}
            dragOver={props.krollDragOver}
            accept=".csv,.xlsx,.xls"
            onDrop={(e) => props.onDrop(e, 'kroll')}
            onDragOver={(e) => props.onDragOver(e, 'kroll')}
            onDragLeave={() => props.onDragLeave('kroll')}
            onFileSelect={(e) => props.onFileSelect(e, 'kroll')}
            onRemoveFile={(index) => props.onRemoveFile(index, 'kroll')}
            onClearAll={() => props.onClearAllFiles('kroll')}
          />
        </div>
      </div>

      <div className="mt-6 flex justify-center">
        <button
          className="btn-primary"
          onClick={props.onProcess}
          disabled={props.mckessonFiles.length === 0 || props.krollFiles.length === 0 || props.parsing}
        >
          {props.parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {props.parsing ? 'Processing...' : 'Process Files'}
        </button>
      </div>

      {(props.mckessonFiles.length === 0 || props.krollFiles.length === 0) && (
        <p className="mt-3 text-center text-xs text-neutral-400">
          Upload at least one McKesson and one Kroll file to start reconciliation
        </p>
      )}
    </div>
  );
}

// =================== DROP ZONE ===================

interface DropZoneProps {
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
          <p className="mt-2 text-xs text-neutral-300">Drag & drop or click to browse</p>
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
          <p className="mt-2 text-xs text-neutral-300">Drag & drop or click to browse (multiple files allowed)</p>
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
