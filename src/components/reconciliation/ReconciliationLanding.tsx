import type { ChangeEvent, DragEvent } from 'react';
import {
  Scale,
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  History,
} from 'lucide-react';
import SectionMarker from '@/components/SectionMarker';
import DropZone from '@/components/ui/DropZone';

export interface LandingViewProps {
  mckessonFiles: File[];
  krollFiles: File[];
  mckessonDragOver: boolean;
  krollDragOver: boolean;
  parsing: boolean;
  cycles: { id: string; status: string; created_at: string }[];
  cyclesLoading: boolean;
  startFromPreviousMode: 'database' | 'file' | 'zero';
  drugCount: number;
  packedDrugCount: number;
  savedCountFile: File | null;
  savedCountDragOver: boolean;
  hasExistingData: boolean;
  onDrop: (e: DragEvent<HTMLDivElement>, zone: 'mckesson' | 'kroll') => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, zone: 'mckesson' | 'kroll') => void;
  onDragLeave: (zone: 'mckesson' | 'kroll') => void;
  onFileSelect: (e: ChangeEvent<HTMLInputElement>, zone: 'mckesson' | 'kroll') => void;
  onRemoveFile: (index: number, zone: 'mckesson' | 'kroll') => void;
  onClearAllFiles: (zone: 'mckesson' | 'kroll') => void;
  onSavedCountDrop: (e: DragEvent<HTMLDivElement>) => void;
  onSavedCountDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onSavedCountDragLeave: () => void;
  onSavedCountSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onSavedCountClear: () => void;
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
          <SectionMarker label="Reconciliation" />
          <h1 className="mt-4 font-display text-3xl text-neutral-900">Reconciliation</h1>
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
        <div className="mb-6 card border-primary-200 bg-primary-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-primary-600" />
              <div>
                <p className="text-sm font-medium text-primary-900">Existing data detected</p>
                <p className="text-xs text-primary-700">
                  New uploads will be deduplicated against existing data to prevent duplicates.
                </p>
              </div>
            </div>
            <button
              onClick={props.onClearAll}
              className="text-sm font-medium text-primary-700 hover:text-primary-900"
            >
              Clear all data
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 card p-4">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
          <div>
            <p className="text-sm font-medium text-neutral-800">Pack size conversion</p>
            <p className="text-xs text-neutral-500">
              Every DIN from uploaded files and manual entries is matched to the CDSA/DPD drug
              reference for the product name and CDSA schedule (unmatched DINs are retried with a
              leading zero). Quantities are multiplied by each drug's Pack Size to record total units.
            </p>
            {props.drugCount > 0 && (
              <p className="mt-1 text-xs text-neutral-400">
                {props.packedDrugCount > 0
                  ? `${props.packedDrugCount} of ${props.drugCount} drugs multiply the entered quantity by their pack size.`
                  : `None of your ${props.drugCount} drugs has a Pack Size above 1 yet, so quantities are recorded as entered. Set Pack Size in Inventory to convert packs into units.`}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mb-6 card p-6">
        <h3 className="mb-4 text-lg font-semibold text-neutral-900">Starting Count Option</h3>
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="startOption"
              checked={props.startFromPreviousMode === 'zero'}
              onChange={() => props.onStartFromPreviousModeChange('zero')}
              className="h-4 w-4 text-primary-600"
            />
            <span className="text-sm text-neutral-700">Start from zero</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="startOption"
              checked={props.startFromPreviousMode === 'database'}
              onChange={() => props.onStartFromPreviousModeChange('database')}
              className="h-4 w-4 text-primary-600"
            />
            <span className="text-sm text-neutral-700">Start from previous saved counts (from database)</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
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
              files={props.savedCountFile ? [props.savedCountFile] : []}
              multiple={false}
              dragOver={props.savedCountDragOver}
              onDrop={props.onSavedCountDrop}
              onDragOver={props.onSavedCountDragOver}
              onDragLeave={props.onSavedCountDragLeave}
              onFileSelect={props.onSavedCountSelect}
              onRemoveFile={props.onSavedCountClear}
              onClearAll={props.onSavedCountClear}
            />
          </div>
        )}
      </div>

      <div className="mb-6 card p-6">
        <h3 className="mb-4 text-lg font-semibold text-neutral-900">File Uploads</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <DropZone
            label="McKesson Exports"
            description="Upload one or more McKesson purchase reports (.csv, .xlsx, .xls)"
            icon={FileSpreadsheet}
            files={props.mckessonFiles}
            dragOver={props.mckessonDragOver}
            onDrop={(e) => props.onDrop(e, 'mckesson')}
            onDragOver={(e) => props.onDragOver(e, 'mckesson')}
            onDragLeave={() => props.onDragLeave('mckesson')}
            onFileSelect={(e) => props.onFileSelect(e, 'mckesson')}
            onRemoveFile={(index) => props.onRemoveFile(index, 'mckesson')}
            onClearAll={() => props.onClearAllFiles('mckesson')}
          />
          <DropZone
            label="Kroll Exports"
            description="Upload one or more Kroll dispensing reports (.csv, .xlsx, .xls)"
            icon={FileText}
            files={props.krollFiles}
            dragOver={props.krollDragOver}
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
