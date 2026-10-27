import { useCallback, useState, type ChangeEvent, type DragEvent } from 'react';
import toast from 'react-hot-toast';
import { isSupportedFile } from '@/lib/fileParser';

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

  const addFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return;

    const valid = incoming.filter(isSupportedFile);
    if (valid.length === 0) {
      toast.error('Files must be .csv, .xlsx, or .xls');
      return;
    }

    setFiles((previous) => [...previous, ...valid]);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      addFiles(Array.from(event.dataTransfer.files ?? []));
      setDragOver(false);
    },
    [addFiles]
  );

  const handleSelect = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(event.target.files ?? []);
      // Reset so picking the same file again still fires a change event.
      event.target.value = '';
      addFiles(selected);
    },
    [addFiles]
  );

  const remove = useCallback((index: number) => {
    setFiles((previous) => previous.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => setFiles([]), []);

  return { files, dragOver, setDragOver, handleDrop, handleSelect, remove, clear };
}
