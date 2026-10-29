import { useState } from 'react';
import { Loader2, Save, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import SectionMarker from '@/components/SectionMarker';
import DropZone from '@/components/ui/DropZone';
import EmptyState from '@/components/ui/EmptyState';
import FilePreviewDialog from '@/components/records/FilePreviewDialog';
import SavedFilesList from '@/components/records/SavedFilesList';
import { RECORD_KINDS } from '@/components/records/config';
import {
  parseSingleFileWithIndividualRows,
  type FilePreview,
  type ParsedIndividualRow,
} from '@/lib/fileParser';
import { createPackSizeResolver } from '@/lib/dinReference';
import { useDrugs } from '@/hooks/useDrugs';
import { useFileList } from '@/hooks/useFileList';
import { useDeleteImportedFile } from '@/hooks/useDeleteImportedFile';
import {
  useImportedRecords,
  useSaveImportedIndividualRows,
  type ImportKind,
} from '@/hooks/useImportedRecords';

/** Per-kind accent used by the type selector cards. */
const SELECTOR_STYLES: Record<ImportKind, { description: string; color: string }> = {
  purchase: { description: 'Upload purchase records file', color: 'bg-primary-50 text-primary-600' },
  dispense: { description: 'Upload dispensing records file', color: 'bg-secondary-50 text-secondary-600' },
  destruction: { description: 'Upload destruction records file', color: 'bg-error-50 text-error-600' },
};

const UPLOAD_TYPES = (Object.keys(RECORD_KINDS) as ImportKind[]).map((kind) => ({
  kind,
  ...RECORD_KINDS[kind],
  ...SELECTOR_STYLES[kind],
}));

const PREVIEW_ROW_LIMIT = 20;

/**
 * Uploads a supplier export as individual transaction rows.
 *
 * Distinct from `RecordImportPage`, which aggregates the rows into one ledger entry per
 * DIN. Both flows share the drop zone, the preview dialog and the saved-file list.
 */
export default function UploadFile() {
  const [kind, setKind] = useState<ImportKind>('purchase');
  const meta = RECORD_KINDS[kind];
  const { files, dragOver, setDragOver, handleDrop, handleSelect, remove, clear } = useFileList();

  const { data: savedRecords, isLoading: savedLoading } = useImportedRecords(kind);
  const { data: drugs } = useDrugs();
  const saveMutation = useSaveImportedIndividualRows(kind);
  const { deleteFile, isPending: deleting } = useDeleteImportedFile(kind);

  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<ParsedIndividualRow[]>([]);
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const resetUpload = () => {
    setRows([]);
    setPreviews([]);
    setShowPreview(false);
    clear();
  };

  const handleProcessFiles = async () => {
    if (files.length === 0) {
      toast.error('Please upload at least one file');
      return;
    }

    setParsing(true);
    try {
      // Purchase quantities are converted to total units by the pack size that ends each
      // product description (e.g. "DILAUDID TB 8MG 100" -> 100). The drug record's pack
      // size is only used when a file states no pack size at all.
      const packSizeFor = createPackSizeResolver(drugs ?? []);
      const seenSignatures = new Set<string>();
      const collected: ParsedIndividualRow[] = [];
      const collectedPreviews: FilePreview[] = [];

      for (const file of files) {
        const { data, preview } = await parseSingleFileWithIndividualRows(
          file,
          meta.parseSource,
          seenSignatures,
          packSizeFor
        );
        // A loop, not push(...data): spreading 100,000+ rows into call arguments overflows
        // the call stack ("Maximum call stack size exceeded").
        for (const row of data) collected.push(row);
        collectedPreviews.push(preview);
      }

      setPreviews(collectedPreviews);
      setRows(collected);
      setShowPreview(true);
      toast.success(`Processed ${collected.length} rows from ${files.length} file(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse files');
    } finally {
      setParsing(false);
    }
  };

  const handleSaveRecords = async () => {
    if (rows.length === 0) {
      toast.error('No parsed records to save');
      return;
    }

    try {
      const result = await saveMutation.mutateAsync({ rows, fileName: files[0]?.name });

      if (result.errors.length > 0) {
        toast.error(
          `Saved ${result.saved} rows, ${result.skipped} failed. Some rows may already exist in inventory.`
        );
      } else {
        toast.success(`Saved ${result.saved} rows${result.skipped ? ` (${result.skipped} skipped)` : ''}`);
      }

      resetUpload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save records');
    }
  };

  return (
    <div>
      <div className="mb-6">
        <SectionMarker label="Upload" />
        <h1 className="mt-4 font-display text-3xl text-neutral-900">Upload File</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Upload purchase, dispensing, or destruction records
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {UPLOAD_TYPES.map((type) => {
          const Icon = type.icon;
          return (
            <button
              key={type.kind}
              onClick={() => {
                setKind(type.kind);
                resetUpload();
              }}
              className={`card p-4 text-left transition-all hover:shadow-elevated ${
                kind === type.kind ? 'ring-2 ring-primary-300' : ''
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

      <div className="mb-6">
        <DropZone
          label={`Upload ${meta.title}`}
          description={`Upload your ${meta.title.toLowerCase()} file (.csv, .xlsx, .xls)`}
          icon={meta.icon}
          files={files}
          dragOver={dragOver}
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

      {rows.length > 0 && (
        <div className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">Parsed Rows ({rows.length})</h2>
            <button className="btn-primary" onClick={handleSaveRecords} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saveMutation.isPending ? 'Saving...' : 'Save Records'}
            </button>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="border-b border-white/10 bg-ink-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      DIN
                    </th>
                    <th className="border-b border-white/10 bg-ink-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Description
                    </th>
                    <th className="border-b border-white/10 bg-ink-900 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Pack
                    </th>
                    <th className="border-b border-white/10 bg-ink-900 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      {meta.quantityLabel}
                    </th>
                    <th className="border-b border-white/10 bg-ink-900 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, PREVIEW_ROW_LIMIT).map((row, index) => (
                    <tr key={`${row.din}-${index}`} className="border-b border-white/5">
                      <td className="px-4 py-3 font-mono text-sm text-neutral-800">{row.din}</td>
                      <td className="px-4 py-3 text-sm text-neutral-600">{row.description ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-sm text-neutral-500">
                        {row.packSize > 1 ? `× ${row.packSize}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-neutral-600">{row.quantity}</td>
                      <td className="px-4 py-3 text-right text-xs text-neutral-400">
                        {row.date ? row.date.toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {rows.length > PREVIEW_ROW_LIMIT && (
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-center text-xs text-neutral-400">
                        ... and {rows.length - PREVIEW_ROW_LIMIT} more rows
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showPreview && previews.length > 0 && (
        <FilePreviewDialog
          previews={previews}
          summary={`${rows.length} row${rows.length === 1 ? '' : 's'} parsed from ${files.length} file(s).`}
          onConfirm={() => setShowPreview(false)}
          onCancel={resetUpload}
        />
      )}

      <div>
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Uploaded Files</h2>
        <div className="card overflow-hidden">
          <SavedFilesList
            records={savedRecords}
            loading={savedLoading}
            icon={meta.icon}
            quantityLabel={meta.quantityLabel}
            rowsPerFile={5}
            onDeleteFile={deleteFile}
            deleting={deleting}
            renderEmpty={() => <EmptyState icon={meta.icon} title="No uploaded files yet" />}
          />
        </div>
      </div>
    </div>
  );
}
