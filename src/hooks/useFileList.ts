import { useCallback, useState, type ChangeEvent, type DragEvent } from 'react';
import toast from 'react-hot-toast';
import { prepareFiles } from '@/lib/fileParser';
import { isSupportedFile, validateUploads, SUPPORTED_FORMATS_LABEL } from '@/lib/uploadValidation';

export interface FileListState {
  files: File[];
  dragOver: boolean;
  /** True while a file that was just added is still being read in the background. */
  preparing: boolean;
  setDragOver: (value: boolean) => void;
  handleDrop: (event: DragEvent<HTMLDivElement>) => void;
  handleSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  remove: (index: number) => void;
  clear: () => void;
}

/**
 * Collects files from drag-and-drop or the file picker.
 *
 * Every upload screen (reconciliation's two zones, the record import page, the upload
 * page) re-implemented this same block of handlers; they now share it.
 */
export function useFileList(): FileListState {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  // A 10 MB export takes a few seconds to read, so the screens show a progress hint while
  // a read is in flight. A counter rather than a flag: two quick drops must not clear the
  // hint for each other.
  const [readsInFlight, setReadsInFlight] = useState(0);

  const addFiles = useCallback(async (incoming: File[]) => {
    if (incoming.length === 0) return;

    if (!incoming.some(isSupportedFile)) {
      toast.error(`Files must be ${SUPPORTED_FORMATS_LABEL}`);
      return;
    }

    // Extension, size and magic bytes. A genuinely renamed file is rejected here; the
    // browser-reported MIME type is ignored, because it is wrong for .csv on Windows.
    const { accepted, rejected } = await validateUploads(incoming.filter(isSupportedFile));
    for (const { reason } of rejected) toast.error(reason);
    if (accepted.length === 0) return;

    setFiles((previous) => [...previous, ...accepted]);

    // Parse in the background right away so "Process" is instant. Any error is reported
    // by the real parse, with the file's name, when the user presses the button.
    setReadsInFlight((count) => count + 1);
    void prepareFiles(accepted)
      .catch(() => undefined)
      .finally(() => setReadsInFlight((count) => Math.max(0, count - 1)));
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void addFiles(Array.from(event.dataTransfer.files ?? []));
      setDragOver(false);
    },
    [addFiles]
  );

  const handleSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(event.target.files ?? []);
      // Reset so picking the same file again still fires a change event.
      event.target.value = '';
      void addFiles(selected);
    },
    [addFiles]
  );

  const remove = useCallback((index: number) => {
    setFiles((previous) => previous.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => {
    setFiles([]);
    setReadsInFlight(0);
  }, []);

  return {
    files,
    dragOver,
    preparing: readsInFlight > 0,
    setDragOver,
    handleDrop,
    handleSelect,
    remove,
    clear,
  };
}
