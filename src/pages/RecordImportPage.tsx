import { useState } from 'react';
import { Loader2, Pencil, Save, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import SectionMarker from '@/components/SectionMarker';
import DropZone from '@/components/ui/DropZone';
import EmptyState from '@/components/ui/EmptyState';
import FilePreviewDialog from '@/components/records/FilePreviewDialog';
import SavedFilesList from '@/components/records/SavedFilesList';
import { RECORD_KINDS } from '@/components/records/config';
import { parseSingleFileWithPreview, type FilePreview } from '@/lib/fileParser';
import { createPackSizeResolver } from '@/lib/dinReference';
import { useDrugs } from '@/hooks/useDrugs';
import { useFileList } from '@/hooks/useFileList';
import { useDeleteImportedFile } from '@/hooks/useDeleteImportedFile';
import {
  useImportedRecords,
  useSaveImportedRecords,
  type ImportKind,
} from '@/hooks/useImportedRecords';
import type { ParsedDinData } from '@/types/reconciliation';

/** The quantity a parsed row carries for a given record kind. */
function quantityOf(kind: ImportKind, record: ParsedDinData): number {
  if (kind === 'purchase') return record.purchased;
  return record.dispensed || record.purchased;
}

/**
 * Upload + manage one record kind, with the parsed rows editable before they are saved.
 * Rendered by the destruction route; the other kinds use the same components.
 */
export default function RecordImportPage({ kind }: { kind: ImportKind }) {
  const meta = RECORD_KINDS[kind];
  const { files, dragOver, preparing, setDragOver, handleDrop, handleSelect, remove, clear } =
    useFileList();

  const { data: savedRecords, isLoading: savedLoading } = useImportedRecords(kind);
  const { data: drugs } = useDrugs();
  const saveMutation = useSaveImportedRecords(kind);
  const { deleteFile, isPending: deleting } = useDeleteImportedFile(kind);

  const [parsing, setParsing] = useState(false);
  const [records, setRecords] = useState<ParsedDinData[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const handleProcessFiles = async () => {
    if (files.length === 0) {
      toast.error('Please upload at least one file');
      return;
    }

    setParsing(true);
    try {
      // Quantities are converted to total units via each drug record's Pack Size.
      const packSizeFor = createPackSizeResolver(drugs ?? []);
      // Shared across files so a row repeated in two uploads is only counted once.
      const seenSignatures = new Set<string>();
      const merged = new Map<string, ParsedDinData>();
      const collectedPreviews: FilePreview[] = [];

      for (const file of files) {
        const { data, preview } = await parseSingleFileWithPreview(
          file,
          meta.parseSource,
          seenSignatures,
          packSizeFor
        );

        for (const [din, incoming] of data) {
          const existing = merged.get(din);
          if (!existing) {
            merged.set(din, incoming);
            continue;
          }
          existing.purchased += incoming.purchased;
          existing.dispensed += incoming.dispensed;
          existing.transactions = [...(existing.transactions ?? []), ...(incoming.transactions ?? [])];
        }

        collectedPreviews.push(preview);
      }

      const parsed = [...merged.values()].sort((a, b) => a.din.localeCompare(b.din));
      setPreviews(collectedPreviews);
      setRecords(parsed);
      setShowPreview(true);
      toast.success(`Processed ${parsed.length} records from ${files.length} file(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse files');
    } finally {
      setParsing(false);
    }
  };

  const handleSaveRecords = async () => {
    if (records.length === 0) {
      toast.error('No parsed records to save');
      return;
    }

    try {
      const fileName = files[0]?.name;
      const result = await saveMutation.mutateAsync({ records, fileName });

      if (result.errors.length > 0) {
        toast.error(
          `Saved ${result.saved} records, ${result.skipped} failed. Some drugs may already exist in inventory.`
        );
      } else {
        toast.success(`Saved ${result.saved} records${result.skipped ? ` (${result.skipped} skipped)` : ''}`);
      }

      resetUpload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save records');
    }
  };

  const resetUpload = () => {
    setRecords([]);
    setPreviews([]);
    setShowPreview(false);
    clear();
  };

  const handleQuantityChange = (index: number, value: string) => {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < 0) return;

    setRecords((previous) => {
      const next = [...previous];
      const record = { ...next[index] };
      if (kind === 'purchase') record.purchased = parsed;
      else record.dispensed = parsed;
      next[index] = record;
      return next;
    });
  };

  return (
    <div>
      <div className="mb-6">
        <SectionMarker label={meta.title} />
        <h1 className="mt-4 font-display text-3xl text-neutral-900">{meta.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{meta.subtitle}</p>
      </div>

      <div className="mb-6">
        <DropZone
          label={meta.dropLabel}
          description={meta.dropDescription}
          icon={meta.icon}
          files={files}
          dragOver={dragOver}
          preparing={preparing}
          onDrop={handleDrop}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onFileSelect={handleSelect}
          onRemoveFile={remove}
          onClearAll={clear}
        />
      </div>

      <div className="mb-6 flex justify-center">
        <button className="btn-primary" onClick={handleProcessFiles} disabled={files.length === 0 || parsing}>
          {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {parsing ? 'Processing...' : `Process ${files.length} File${files.length === 1 ? '' : 's'}`}
        </button>
      </div>

      {records.length > 0 && (
        <div className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">Parsed Records ({records.length})</h2>
            <button className="btn-primary" onClick={handleSaveRecords} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saveMutation.isPending ? 'Saving...' : 'Save Records'}
            </button>
          </div>

          <div className="card overflow-hidden">
            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="sticky top-0 z-10 border-b border-white/10 bg-ink-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      DIN
                    </th>
                    <th className="sticky top-0 z-10 border-b border-white/10 bg-ink-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Description
                    </th>
                    <th className="sticky top-0 z-10 border-b border-white/10 bg-ink-900 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      {meta.quantityLabel}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record, index) => (
                    <tr key={record.din} className="border-b border-white/5 transition-colors hover:bg-white/5">
                      <td className="px-4 py-3 font-mono text-sm text-neutral-800">{record.din}</td>
                      <td className="px-4 py-3 text-sm text-neutral-600">{record.description ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-sm text-neutral-600">
                        {editingIndex === index ? (
                          <input
                            type="number"
                            autoFocus
                            defaultValue={quantityOf(kind, record)}
                            onChange={(event) => handleQuantityChange(index, event.target.value)}
                            onBlur={() => setEditingIndex(null)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') event.currentTarget.blur();
                            }}
                            className="w-24 rounded border border-primary-400 px-2 py-1 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                            min="0"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingIndex(index)}
                            className="inline-flex items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-primary-50 hover:text-primary-600"
                            title="Click to edit"
                          >
                            {quantityOf(kind, record)}
                            <Pencil className="h-3 w-3 opacity-50" />
                          </button>
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

      {showPreview && previews.length > 0 && (
        <FilePreviewDialog
          previews={previews}
          summary={`${records.length} record${records.length === 1 ? '' : 's'} parsed from ${files.length} file(s).`}
          onConfirm={() => setShowPreview(false)}
          onCancel={resetUpload}
        />
      )}

      <div>
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Saved Records</h2>
        <div className="card overflow-hidden">
          <SavedFilesList
            records={savedRecords}
            loading={savedLoading}
            icon={meta.icon}
            quantityLabel={meta.quantityLabel}
            rowsPerFile={5}
            onDeleteFile={deleteFile}
            deleting={deleting}
            renderEmpty={() => (
              <EmptyState icon={Trash2} title="No saved records yet" description={meta.emptyDescription} />
            )}
          />
        </div>
      </div>
    </div>
  );
}
