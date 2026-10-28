import { useCallback, useState, type ChangeEvent, type DragEvent } from 'react';
import toast from 'react-hot-toast';
import { prepareFiles } from '@/lib/fileParser';
import { isSupportedFile, validateUploads, SUPPORTED_FORMATS_LABEL } from '@/lib/uploadValidation';

export interface FileListState {
  files: File[];
  dragOver: boolean;
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

  const addFiles = useCallback(async (incoming: File[]) => {
    if (incoming.length === 0) return;

    if (!incoming.some(isSupportedFile)) {
      toast.error(`Files must be ${SUPPORTED_FORMATS_LABEL}`);
      return;
    }

    // Extension, MIME type, size and magic bytes - a renamed file is rejected here.
    const { accepted, rejected } = await validateUploads(incoming.filter(isSupportedFile));
    for (const { reason } of rejected) toast.error(reason);
    if (accepted.length === 0) return;

    setFiles((previous) => [...previous, ...accepted]);

    // Parse in the background right away so "Process" is instant. Any error is reported
    // by the real parse, with the file's name, when the user presses the button.
    void prepareFiles(accepted).catch(() => undefined);
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

  const clear = useCallback(() => setFiles([]), []);

  return { files, dragOver, setDragOver, handleDrop, handleSelect, remove, clear };
}
