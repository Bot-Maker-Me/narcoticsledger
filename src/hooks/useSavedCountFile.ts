import { useState, type ChangeEvent, type DragEvent } from 'react';
import toast from 'react-hot-toast';
import { padDin } from '@/lib/din';
import { getErrorMessage } from '@/lib/errors';
import { readFileRows } from '@/lib/readRows';
import { validateUpload } from '@/lib/uploadValidation';

/** Column headings suppliers vary between, for the DIN and the counted quantity. */
const DIN_COLUMNS = ['DIN', 'din', 'Drug Identification Number', 'Drug ID'];
const COUNT_COLUMNS = ['Actual', 'actual', 'ACTUAL', 'actual_count'];

/**
 * The optional "saved counts" file a user supplies to seed opening balances.
 *
 * Parsing is deliberately lenient about headings but strict about values: a row without a
 * DIN or a positive count is dropped, and if nothing survives the user is told, because
 * silently starting every opening balance at zero would look like a genuine count.
 */
export function useSavedCountFile() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());

  const parseFile = async (selected: File) => {
    try {
      const parsed = new Map<string, number>();

      // Same worker-based reader as the supplier files, so .xlsx saved counts work too.
      for (const row of await readFileRows(selected)) {
        const rawDin = DIN_COLUMNS.map((column) => row[column]).find(Boolean);
        const rawActual = COUNT_COLUMNS.map((column) => row[column]).find(Boolean);
        if (!rawDin || !rawActual) continue;

        const din = padDin(rawDin);
        const count = parseInt(String(rawActual).trim(), 10);

        if (din && !isNaN(count) && count > 0) parsed.set(din, count);
      }

      setCounts(parsed);

      if (parsed.size === 0) {
        toast.error(
          'No valid counts found in saved count file. Please ensure the file has "DIN" and "Actual" columns.'
        );
      } else {
        toast.success(`Loaded ${parsed.size} saved counts from file`);
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to parse saved count file'));
    }
  };

  const accept = async (candidate: File) => {
    const result = await validateUpload(candidate);
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    setFile(candidate);
    void parseFile(candidate);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);

    const dropped = event.dataTransfer.files?.[0];
    if (dropped) void accept(dropped);
  };

  const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (selected) void accept(selected);
  };

  const clear = () => {
    setFile(null);
    setCounts(new Map());
  };

  return { file, dragOver, setDragOver, counts, handleDrop, handleSelect, clear };
}
