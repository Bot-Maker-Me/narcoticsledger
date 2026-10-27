import { FileSpreadsheet, FileText, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ImportKind } from '@/hooks/useImportedRecords';

/** The filter a chip controls. Both record kinds filter on the same four fields. */
export type RecordFilterKey = 'date' | 'din' | 'qty' | 'description';

export interface RecordKindMeta {
  title: string;
  subtitle: string;
  dropLabel: string;
  dropDescription: string;
  icon: LucideIcon;
  /** Which supplier export profile the parser should use. */
  parseSource: 'mckesson' | 'kroll';
  /** Column heading and summary verb for the quantity, e.g. "Purchased". */
  quantityLabel: string;
  /** Copy shown when nothing has been uploaded yet. */
  emptyTitle: string;
  emptyDescription: string;
  /** Filter chips offered by the record browser, in display order. */
  filterOptions: Array<{ value: RecordFilterKey; label: string }>;
}

/**
 * Per-kind copy and behaviour for the whole records feature.
 *
 * Purchase, dispensing and destruction screens used to each hard-code their own version
 * of this, which is how two 333-line pages ended up almost identical.
 */
export const RECORD_KINDS: Record<ImportKind, RecordKindMeta> = {
  purchase: {
    title: 'Purchase Records',
    subtitle: 'View all uploaded purchase records (raw data from files)',
    dropLabel: 'Upload Purchase File',
    dropDescription: 'Upload your purchase records file (.csv, .xlsx, .xls)',
    icon: FileSpreadsheet,
    parseSource: 'mckesson',
    quantityLabel: 'Purchased',
    emptyTitle: 'No purchase records uploaded yet',
    emptyDescription: 'Go to Upload File to add purchase records',
    filterOptions: [
      { value: 'date', label: 'Date' },
      { value: 'din', label: 'DIN' },
      { value: 'qty', label: 'Qty' },
      { value: 'description', label: 'Description' },
    ],
  },
  dispense: {
    title: 'Dispensing Records',
    subtitle: 'View all uploaded dispensing records (raw data from files)',
    dropLabel: 'Upload Dispensing File',
    dropDescription: 'Upload your dispensing records file (.csv, .xlsx, .xls)',
    icon: FileText,
    parseSource: 'kroll',
    quantityLabel: 'Dispensed',
    emptyTitle: 'No dispensing records uploaded yet',
    emptyDescription: 'Go to Upload File to add dispensing records',
    filterOptions: [
      { value: 'qty', label: 'Qty' },
      { value: 'description', label: 'Drug' },
      { value: 'din', label: 'DIN' },
      { value: 'date', label: 'Fill Date' },
    ],
  },
  destruction: {
    title: 'Destruction Records',
    subtitle: 'Upload and manage destruction records independently',
    dropLabel: 'Upload Destruction File',
    dropDescription: 'Upload your destruction records file (.csv, .xlsx, .xls)',
    icon: Trash2,
    parseSource: 'kroll',
    quantityLabel: 'Destroyed',
    emptyTitle: 'No destruction records uploaded yet',
    emptyDescription: 'Upload a destruction file above to add records',
    filterOptions: [
      { value: 'date', label: 'Date' },
      { value: 'din', label: 'DIN' },
      { value: 'qty', label: 'Qty' },
      { value: 'description', label: 'Description' },
    ],
  },
};
