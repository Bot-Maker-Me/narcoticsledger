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
  Pencil,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { parseSingleFile, parseSingleFileWithPreview, type FilePreview } from '@/lib/fileParser';
import { createPackSizeResolver } from '@/lib/dinReference';
import { useDrugs } from '@/hooks/useDrugs';
import type { ParsedDinData } from '@/types/reconciliation';
import {
  useImportedRecords,
  useSaveImportedRecords,
  useDeleteImportedFile,
  type ImportKind,
  type SaveResult,
} from '@/hooks/useImportedRecords';

const KIND_META: Record<
  ImportKind,
  {
    title: string;
    subtitle: string;
    dropLabel: string;
    dropDescription: string;
    icon: typeof FileSpreadsheet;
    parseSource: 'mckesson' | 'kroll';
    qtyLabel: string;
  }
> = {
  purchase: {
    title: 'Purchase Records',
    subtitle: 'Upload and manage purchase records independently',
    dropLabel: 'Upload Purchase File',
    dropDescription: 'Upload your purchase records file (.csv, .xlsx, .xls)',
    icon: FileSpreadsheet,
    parseSource: 'mckesson',
    qtyLabel: 'Purchased',
  },
  dispense: {
    title: 'Dispensing Records',
    subtitle: 'Upload and manage dispensing records independently',
    dropLabel: 'Upload Dispensing File',
    dropDescription: 'Upload your dispensing records file (.csv, .xlsx, .xls)',
    icon: FileText,
    parseSource: 'kroll',
    qtyLabel: 'Dispensed',
  },
  destruction: {
    title: 'Destruction Records',
    subtitle: 'Upload and manage destruction records independently',
    dropLabel: 'Upload Destruction File',
    dropDescription: 'Upload your destruction records file (.csv, .xlsx, .xls)',
    icon: Trash2,
    parseSource: 'kroll',
    qtyLabel: 'Destroyed',
  },
};

export default function RecordImportPage({ kind }: { kind: ImportKind }) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const { data: savedRecords, isLoading: savedLoading } = useImportedRecords(kind);
  const { data: drugs } = useDrugs();
  const saveMutation = useSaveImportedRecords(kind);
  const deleteMutation = useDeleteImportedFile(kind);

  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [records, setRecords] = useState<ParsedDinData[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [filePreviews, setFilePreviews] = useState<FilePreview[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

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
      console.log(`Starting to process ${files.length} files...`);

      // Quantities are converted to total units via each drug record's Pack Size.
      const packSizeFor = createPackSizeResolver(drugs ?? []);

      // Create SHARED deduplication set to catch duplicates across multiple files
      const seenSignatures = new Set<string>();
      let allData = new Map<string, any>();
      let previews: FilePreview[] = [];

      // Process all files
      for (const file of files) {
        console.log(`Processing file: ${file.name}`);
        const { data, preview } = await parseSingleFileWithPreview(file, meta.parseSource, seenSignatures, packSizeFor);

        for (const [din, itemData] of data) {
          const existing = allData.get(din);
          if (existing) {
            if (kind === 'purchase') {
              existing.purchased += itemData.purchased;
            } else {
              existing.dispensed += itemData.dispensed;
            }
            existing.transactions = [...(existing.transactions || []), ...(itemData.transactions || [])];
          } else {
            allData.set(din, itemData);
          }
        }

        if (preview) previews.push(preview);
      }

      console.log('All files parsed successfully', { 
        dataSize: allData.size, 
        files: files.length 
      });

      // Set previews and show modal
      setFilePreviews(previews);
      setShowPreviewModal(true);

      // Convert to array and set records
      const recordsArray = Array.from(allData.values());
      setRecords(recordsArray);
      toast.success(`Processed ${recordsArray.length} records from ${files.length} files`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse files';
      toast.error(message);
    }
    setParsing(false);
  };

  const handleProcessFile = async () => {
    await handleProcessFiles();
  };

  const handleSaveRecords = async () => {
    if (records.length === 0) {
      toast.error('No parsed records to save');
      return;
    }

    try {
      // Use the first file name as the identifier for this batch
      const fileName = files.length > 0 ? files[0].name : undefined;
      
      const result: SaveResult = await saveMutation.mutateAsync({ records, fileName });
      
      if (result.errors.length > 0) {
        toast.error(`Saved ${result.saved} records, ${result.skipped} failed. Some drugs may already exist in inventory.`);
        console.error('Save errors:', result.errors);
      } else {
        toast.success(`Saved ${result.saved} records${result.skipped ? ` (${result.skipped} skipped)` : ''}`);
      }
      
      setRecords([]);
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

  const handleEditRecord = (index: number) => {
    setEditingIndex(index);
  };

  const handleQuantityChange = (index: number, value: string) => {
    const newValue = parseInt(value, 10);
    if (isNaN(newValue) || newValue < 0) return;

    const updatedRecords = [...records];
    if (kind === 'purchase') {
      updatedRecords[index].purchased = newValue;
    } else if (kind === 'dispense') {
      updatedRecords[index].dispensed = newValue;
    } else {
      updatedRecords[index].dispensed = newValue;
    }

    setRecords(updatedRecords);
  };

  const handleBlur = () => {
    setEditingIndex(null);
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">{meta.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{meta.subtitle}</p>
      </div>

      <div className="mb-6">
        <DropZone
          label={meta.dropLabel}
          description={meta.dropDescription}
          icon={Icon}
          files={files}
          dragOver={dragOver}
          accept=".csv,.xlsx,.xls"
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

      {records.length > 0 && (
        <div className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">
              Parsed Records ({records.length})
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
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">{meta.qtyLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record, index) => (
                    <tr key={`${record.din}-${index}`} className="border-b border-neutral-50 hover:bg-neutral-50/50">
                      <td className="px-3 py-3 text-sm font-mono text-neutral-800">{record.din}</td>
                      <td className="px-3 py-3 text-sm text-neutral-600">{record.description ?? '—'}</td>
                      <td className="px-3 py-3 text-right text-sm text-neutral-600">
                        {editingIndex === index ? (
                          <input
                            type="number"
                            autoFocus
                            defaultValue={kind === 'purchase' ? record.purchased : kind === 'dispense' ? record.dispensed : (record.dispensed || record.purchased)}
                            onChange={(e) => handleQuantityChange(index, e.target.value)}
                            onBlur={handleBlur}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur();
                              }
                            }}
                            className="w-24 rounded border border-primary-400 px-2 py-1 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                            min="0"
                          />
                        ) : (
                          <span
                            onClick={() => handleEditRecord(index)}
                            className="cursor-pointer hover:bg-primary-50 hover:text-primary-600 rounded px-2 py-1 transition-colors"
                            title="Click to edit"
                          >
                            {kind === 'purchase' ? record.purchased : kind === 'dispense' ? record.dispensed : (record.dispensed || record.purchased)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {showPreviewModal && filePreviews.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
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

      <div>
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Saved Records</h2>
        <div className="card overflow-hidden">
          {savedLoading ? (
            <div className="flex items-center justify-center py-12 text-neutral-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !savedRecords || savedRecords.length === 0 ? (
            <p className="py-12 text-center text-sm text-neutral-400">No saved records yet</p>
          ) : (
            <div>
              {/* Group records by file_name */}
              {(() => {
                const groupedRecords = new Map<string, typeof savedRecords>();
                savedRecords.forEach(record => {
                  const fileName = record.file_name || `Imported ${new Date(record.created_at).toLocaleDateString()}`;
                  if (!groupedRecords.has(fileName)) {
                    groupedRecords.set(fileName, []);
                  }
                  groupedRecords.get(fileName)!.push(record);
                });

                if (groupedRecords.size === 0) {
                  return <p className="py-12 text-center text-sm text-neutral-400">No saved records yet</p>;
                }

                return Array.from(groupedRecords.entries()).map(([fileName, records]) => (
                  <div key={fileName} className="border-b border-neutral-100 last:border-b-0">
                    <div className="flex items-center justify-between bg-neutral-50 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-neutral-500" />
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
                            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">{meta.qtyLabel}</th>
                            <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Saved</th>
                          </tr>
                        </thead>
                        <tbody>
                          {records.slice(0, 5).map((record) => (
                            <tr key={record.id} className="border-b border-neutral-50 hover:bg-neutral-50/50">
                              <td className="px-3 py-2 text-sm font-mono text-neutral-800">{record.din}</td>
                              <td className="px-3 py-2 text-sm text-neutral-600">{record.description}</td>
                              <td className="px-3 py-2 text-right text-sm text-neutral-600">{record.quantity}</td>
                              <td className="px-3 py-2 text-right text-xs text-neutral-400">
                                {new Date(record.created_at).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                          {records.length > 5 && (
                            <tr>
                              <td colSpan={4} className="px-3 py-2 text-center text-xs text-neutral-400">
                                +{records.length - 5} more records
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

interface DropZoneProps {
  label: string;
  description: string;
  icon: typeof FileSpreadsheet;
  files: File[];
  dragOver: boolean;
  accept: string;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
  onClearAll: () => void;
}

function DropZone(props: DropZoneProps) {
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
        multiple
        className="hidden"
        onChange={props.onFileSelect}
      />

      {props.files.length > 0 ? (
        <div className="w-full">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-700">{props.files.length} file{props.files.length !== 1 ? 's' : ''} selected</p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                props.onClearAll();
              }}
              className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              Clear all
            </button>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {props.files.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-neutral-800 truncate">{file.name}</p>
                    <p className="text-xs text-neutral-400">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onRemoveFile(index);
                  }}
                  className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
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
          <p className="mt-2 text-xs text-neutral-300">Drag & drop or click to browse (multiple files supported)</p>
        </>
      )}
    </div>
  );
}
