import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useDeleteImportedFile as useDeleteMutation, type ImportKind } from '@/hooks/useImportedRecords';

/**
 * Deletes every record that came from one uploaded file, behind a confirmation dialog.
 *
 * The confirm + toast + error handling used to be copy-pasted into four record screens,
 * each calling the native `window.confirm`.
 */
export function useDeleteImportedFile(kind: ImportKind) {
  const confirm = useConfirm();
  const mutation = useDeleteMutation(kind);

  const deleteFile = useCallback(
    async (fileName: string) => {
      const confirmed = await confirm({
        title: 'Delete imported records?',
        description: `Every record from "${fileName}" will be deleted. This also removes them from Transaction History.`,
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!confirmed) return;

      try {
        await mutation.mutateAsync(fileName);
        toast.success(`Deleted all records from "${fileName}"`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to delete records');
      }
    },
    [confirm, mutation]
  );

  return { deleteFile, isPending: mutation.isPending };
}
