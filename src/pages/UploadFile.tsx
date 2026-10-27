import { useState, useCallback, useRef, type DragEvent } from 'react';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Trash2,
  CheckCircle2,
  Loader2,
  X,
  Save,
  Plus,
  FileText as FileIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { parseSingleFileWithIndividualRows, type FilePreview } from '@/lib/fileParser';
import { createPackSizeResolver } from '@/lib/dinReference';
import { formatLedgerDate } from '@/lib/ledgerDate';
import { useDrugs } from '@/hooks/useDrugs';
import type { ParsedDinData } from '@/types/reconciliation';
import {
  useImportedRecords,
  useSaveImportedIndividualRows,
  useDeleteImportedFile,
  type ImportKind,
  type SaveResult,
} from '@/hooks/useImportedRecords';
import SectionMarker from '@/components/SectionMarker';

const UPLOAD_TYPES = [
  { 
    id: 'purchase' as ImportKind,
    title: 'Purchase Records',
    description: 'Upload purchase records file',
    icon: FileSpreadsheet,
    parseSource: 'mckesson' as const,
    accept: '.csv,.xlsx,.xls',
    color: 'bg-primary-50 text-primary-600'
  },
  { 
    id: 'dispense' as ImportKind,
    title: 'Dispensing Records', 
    description: 'Upload dispensing records file',
    icon: FileText,
    parseSource: 'kroll' as const,
    accept: '.csv,.xlsx,.xls',
    color: 'bg-secondary-50 text-secondary-600'
  },
  { 
    id: 'destruction' as ImportKind,
    title: 'Destruction Records',
    description: 'Upload destruction records file',
    icon: Trash2,
    parseSource: 'kroll' as const,
    accept: '.csv,.xlsx,.xls',
    color: 'bg-error-50 text-error-600'
  }
];

export default function UploadFile() {
  const [selectedType, setSelectedType] = useState<ImportKind>('purchase');
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [individualRows, setIndividualRows] = useState<Array<{ din: string; description?: string; quantity: number; date: Date | null; type: 'purchase' | 'dispense' }>>([]);
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const currentType = UPLOAD_TYPES.find(t => t.id === selectedType);
  const { data: savedRecords, isLoading: savedLoading } = useImportedRecords(selectedType);
  const { data: drugs } = useDrugs();
  const saveMutation = useSaveImportedIndividualRows(selectedType);
  const deleteMutation = useDeleteImportedFile(selectedType);

  const handleFileDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length === 0) return;

    const validFiles = droppedFiles.filter(file => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      return ext === 'csv' || ext === 'xlsx' || ext === 'xls';
    });

    if (validFiles.length === 0) {
      toast.error('Files must be .csv, .xlsx, or .xls');
      return;
    }

    setFiles(prev => [...prev, ...validFiles]);
    setDragOver(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      setFiles(prev => [...prev, ...selectedFiles]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearAllFiles = () => {
    setFiles([]);
  };

  const handleProcessFiles = async () => {
    if (files.length === 0) {
      toast.error('Please upload at least one file');
      return;
    }

    setParsing(true);
    try {
      // Quantities are converted to total units via each drug record's Pack Size.
      const packSizeFor = createPackSizeResolver(drugs ?? []);

      const seenSignatures = new Set<string>();
      let allRows: Array<{ din: string; description?: string; quantity: number; date: Date | null; type: 'purchase' | 'dispense' }> = [];
      let previews: FilePreview[] = [];

      for (const file of files) {
        const { data, preview } = await parseSingleFileWithIndividualRows(file, currentType!.parseSource, seenSignatures, packSizeFor);
        allRows = [...allRows, ...data];
        if (preview) previews.push(preview);
      }

      setFilePreviews(previews);
      setShowPreviewModal(true);

      setIndividualRows(allRows);
      toast.success(`Processed ${allRows.length} rows from ${files.length} files`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse files';
      toast.error(message);
    }
    setParsing(false);
  };

  const handleSaveRecords = async () => {
    if (individualRows.length === 0) {
      toast.error('No parsed records to save');
      return;
    }

    try {
      const fileName = files.length > 0 ? files[0].name : undefined;
      const result: SaveResult = await saveMutation.mutateAsync({ rows: individualRows, fileName });
      
      if (result.errors.length > 0) {
        toast.error(`Saved ${result.saved} rows, ${result.skipped} failed. Some rows may already exist in inventory.`);
      } else {
        toast.success(`Saved ${result.saved} rows${result.skipped ? ` (${result.skipped} skipped)` : ''}`);
      }
      
      setIndividualRows([]);
      setFiles([]);
      setFilePreviews([]);
      setShowPreviewModal(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save records';
      toast.error(message);
    }
  };

  const handleDeleteFile = async (fileName: string) => {
    if (!confirm(`Are you sure you want to delete all records from "${fileName}"? This will also remove them from Transaction History.`)) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(fileName);
      toast.success(`Deleted all records from "${fileName}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete records';
      toast.error(message);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <SectionMarker index="01" label="Upload" />
        <h1 className="mt-4 font-display text-3xl text-neutral-900">Upload File</h1>
        <p className="mt-1 text-sm text-neutral-500">Upload purchase, dispensing, or destruction records</p>
      </div>

      {/* Upload Type Selection */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {UPLOAD_TYPES.map((type) => {
          const Icon = type.icon;
          return (
            <button
              key={type.id}
              onClick={() => {
                setSelectedType(type.id);
                setFiles([]);
                setIndividualRows([]);
                setFilePreviews([]);
              }}
              className={`card p-4 text-left transition-all hover:shadow-elevated ${
                selectedType === type.id ? 'ring-2 ring-primary-300' : ''
              }`}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${type.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-3 font-medium text-neutral-900">{type.title}</h3>
              <p className="mt-1 text-xs text-neutral-500">{type.description}</p>
            </button>
          );
        })}
      </div>

      {/* Upload Area */}
      <div className="mb-6">
        <DropZone
          label={`Upload ${currentType?.title}`}
          description={`Upload your ${currentType?.title.toLowerCase()} file (.csv, .xlsx, .xls)`}
          icon={currentType?.icon || FileSpreadsheet}
          files={files}
          dragOver={dragOver}
          accept={currentType?.accept || '.csv,.xlsx,.xls'}
          onDrop={handleFileDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onFileSelect={handleFileSelect}
          onRemoveFile={handleRemoveFile}
          onClearAll={handleClearAllFiles}
        />
      </div>

      {/* Process Button */}
      <div className="mb-6 flex justify-center">
        <button
          className="btn-primary"
          onClick={handleProcessFiles}
          disabled={files.length === 0 || parsing}
        >
          {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {parsing ? 'Processing...' : `Process ${files.length} File${files.length !== 1 ? 's' : ''}`}
        </button>
      </div>

      {/* Parsed Records */}
      {individualRows.length > 0 && (
        <div className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">
              Parsed Rows ({individualRows.length})
            </h2>
            <button className="btn-primary" onClick={handleSaveRecords} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saveMutation.isPending ? 'Saving...' : 'Save Records'}
            </button>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50/50">
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">DIN</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Description</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      {selectedType === 'purchase' ? 'Purchased' : selectedType === 'dispense' ? 'Dispensed' : 'Destroyed'}
                    </th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {individualRows.slice(0, 20).map((row, index) => (
                    <tr key={`${row.din}-${index}`} className="border-b border-neutral-50 hover:bg-neutral-50/50">
                      <td className="px-3 py-3 text-sm font-mono text-neutral-800">{row.din}</td>
                      <td className="px-3 py-3 text-sm text-neutral-600">{row.description ?? '—'}</td>
                      <td className="px-3 py-3 text-right text-sm text-neutral-600">{row.quantity}</td>
                      <td className="px-3 py-3 text-right text-xs text-neutral-400">
                        {row.date ? row.date.toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {individualRows.length > 20 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-center text-xs text-neutral-400">
                        ... and {individualRows.length - 20} more rows
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {showPreviewModal && filePreviews.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4">
          <div className="card max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-neutral-900">File Processing Preview</h3>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              {filePreviews.map((preview, index) => (
                <div key={index} className="rounded-lg bg-neutral-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="font-medium text-neutral-800">{preview.fileName}</h4>
                    <span className="text-xs text-neutral-500">{preview.totalRows} rows</span>
                  </div>
                  {preview.dateRange && (
                    <p className="text-xs text-neutral-500">
                      Date range: {preview.dateRange.start?.toLocaleDateString()} - {preview.dateRange.end?.toLocaleDateString()}
                    </p>
                  )}
                  {preview.sampleData && preview.sampleData.length > 0 && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-neutral-200">
                            {Object.keys(preview.sampleData[0]).map(key => (
                              <th key={key} className="px-2 py-1 text-left font-medium text-neutral-600">{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.sampleData.slice(0, 3).map((row, rowIndex) => (
                            <tr key={rowIndex} className="border-b border-neutral-100">
                              {Object.values(row).map((value, cellIndex) => (
                                <td key={cellIndex} className="px-2 py-1 text-neutral-600">{String(value)}</td>
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

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowPreviewModal(false)}
                className="btn-primary"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Uploaded Files Section */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Uploaded Files</h2>
        <div className="card overflow-hidden">
          {savedLoading ? (
            <div className="flex items-center justify-center py-12 text-neutral-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !savedRecords || savedRecords.length === 0 ? (
            <p className="py-12 text-center text-sm text-neutral-400">No uploaded files yet</p>
          ) : (
            <div>
              {(() => {
                const groupedRecords = new Map<string, typeof savedRecords>();
                savedRecords.forEach(record => {
                  const fileName = record.file_name || `Imported ${formatLedgerDate(record.created_at)}`;
                  if (!groupedRecords.has(fileName)) {
                    groupedRecords.set(fileName, []);
                  }
                  groupedRecords.get(fileName)!.push(record);
                });

                if (groupedRecords.size === 0) {
                  return <p className="py-12 text-center text-sm text-neutral-400">No uploaded files yet</p>;
                }

                return Array.from(groupedRecords.entries()).map(([fileName, records]) => (
                  <div key={fileName} className="border-b border-neutral-100 last:border-b-0">
                    <div className="flex items-center justify-between bg-neutral-50 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <FileIcon className="h-4 w-4 text-neutral-500" />
                        <span className="text-sm font-medium text-neutral-800">{fileName}</span>
                        <span className="text-xs text-neutral-500">({records.length} records)</span>
                      </div>
                      <button
                        onClick={() => handleDeleteFile(fileName)}
                        disabled={deleteMutation.isPending}
                        className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-error-50 hover:text-error-600 disabled:opacity-50"
                        title="Delete all records from this file"
                      >
                        {deleteMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-neutral-100 bg-neutral-50/50">
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">DIN</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Description</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                              {selectedType === 'purchase' ? 'Purchased' : selectedType === 'dispense' ? 'Dispensed' : 'Destroyed'}
                            </th>
                            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {records.slice(0, 5).map((record) => (
                            <tr key={record.id} className="border-b border-neutral-50 hover:bg-neutral-50/50">
                              <td className="px-3 py-2 text-sm font-mono text-neutral-800">{record.din}</td>
                              <td className="px-3 py-2 text-sm text-neutral-600">{record.description}</td>
                              <td className="px-3 py-2 text-right text-sm text-neutral-600">{record.quantity}</td>
                              <td className="px-3 py-2 text-right text-xs text-neutral-400">
                                {formatLedgerDate(record.created_at)}
                              </td>
                            </tr>
                          ))}
                          {records.length > 5 && (
                            <tr>
                              <td colSpan={4} className="px-3 py-2 text-center text-xs text-neutral-400">
                                ... and {records.length - 5} more records
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DropZone({
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
  icon: typeof FileSpreadsheet;
  files: File[];
  dragOver: boolean;
  accept: string;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
  onClearAll: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="card">
      <div
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
          dragOver ? 'border-primary-400 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <div className={`flex h-12 w-12 items-center justify-center rounded-full ${dragOver ? 'bg-primary-100' : 'bg-neutral-100'}`}>
          <Icon className={`h-6 w-6 ${dragOver ? 'text-primary-600' : 'text-neutral-400'}`} />
        </div>
        <p className="mt-4 text-sm font-medium text-neutral-900">{label}</p>
        <p className="mt-1 text-xs text-neutral-500">{description}</p>
        <button
          onClick={() => inputRef.current?.click()}
          className="mt-4 rounded-lg border border-neutral-200 bg-surface px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          Choose File
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          onChange={onFileSelect}
          className="hidden"
        />
      </div>

      {files.length > 0 && (
        <div className="mt-4 border-t border-neutral-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-neutral-700">Selected Files ({files.length})</span>
            <button
              onClick={onClearAll}
              className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Clear All
            </button>
          </div>
          <div className="space-y-2">
            {files.map((file, index) => (
              <div key={index} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <FileIcon className="h-4 w-4 text-neutral-400" />
                  <span className="text-sm text-neutral-700">{file.name}</span>
                  <span className="text-xs text-neutral-400">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
                <button
                  onClick={() => onRemoveFile(index)}
                  className="rounded p-1 text-neutral-400 hover:bg-error-50 hover:text-error-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}