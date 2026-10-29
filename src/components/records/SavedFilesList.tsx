import { Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import type { ImportedRecordRow } from '@/hooks/useImportedRecords';
import { formatLedgerDate } from '@/lib/ledgerDate';
import FileGroupTable from '@/components/records/FileGroupTable';

interface SavedFilesListProps {
  records: ImportedRecordRow[] | undefined;
  loading: boolean;
  icon: LucideIcon;
  quantityLabel: string;
  /** Max rows rendered per file, with a "+N more" row. Omit to show every row. */
  rowsPerFile?: number;
  /** Bound each table's height and keep headers sticky. */
  scrollable?: boolean;
  /** Shown when there are no records to display. */
  renderEmpty: () => ReactNode;
  onDeleteFile: (fileName: string) => void;
  deleting?: boolean;
}

/** Group records by the file they were imported from and render one table per file. */
export default function SavedFilesList({
  records,
  loading,
  icon,
  quantityLabel,
  rowsPerFile,
  scrollable = false,
  renderEmpty,
  onDeleteFile,
  deleting = false,
}: SavedFilesListProps) {
  const grouped = useMemo(() => {
    const groups = new Map<string, ImportedRecordRow[]>();
    for (const record of records ?? []) {
      const fileName = record.file_name || `Imported ${formatLedgerDate(record.created_at)}`;
      const bucket = groups.get(fileName);
      if (bucket) bucket.push(record);
      else groups.set(fileName, [record]);
    }
    return groups;
  }, [records]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!records || records.length === 0 || grouped.size === 0) {
    return <>{renderEmpty()}</>;
  }

  return (
    <div>
      {[...grouped.entries()].map(([fileName, fileRecords]) => (
        <FileGroupTable
          key={fileName}
          fileName={fileName}
          records={rowsPerFile ? fileRecords.slice(0, rowsPerFile) : fileRecords}
          totalRows={fileRecords.length}
          quantityLabel={quantityLabel}
          icon={icon}
          scrollable={scrollable}
          onDelete={() => onDeleteFile(fileName)}
          deleting={deleting}
        />
      ))}
    </div>
  );
}
