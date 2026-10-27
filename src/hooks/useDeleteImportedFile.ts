import { useCallback } from 'react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useVoidImportedFile, type ImportKind } from '@/hooks/useImportedRecords';
import { getErrorMessage } from '@/lib/errors';

/**
 * Voids every record that came from one uploaded file, behind a confirmation dialog.
 *
 * The ledger is append-only (`inventory_transactions` only grants SELECT and INSERT to
 * signed-in users), so records are marked voided rather than deleted: stock maths and the
 * record browsers drop them, but the audit trail keeps them forever.
 */
export function useDeleteImportedFile(kind: ImportKind) {
  const confirm = useConfirm();
  const mutation = useVoidImportedFile(kind);

  const deleteFile = useCallback(
    async (fileName: string) => {
      const confirmed = await confirm({
        title: 'Void these records?',
        description:
          `Every record from "${fileName}" will be voided. Voided records stay in ` +
          'Transaction History for the audit trail but stop counting toward stock.',
        confirmLabel: 'Void records',
        destructive: true,
      });
      if (!confirmed) return;

      try {
        const voided = await mutation.mutateAsync(fileName);
        if (voided === 0) {
          toast.error('No matching records to void');
          return;
        }
        toast.success(`Voided ${voided} record${voided === 1 ? '' : 's'} from "${fileName}"`);
      } catch (err) {
        toast.error(getErrorMessage(err, 'Failed to void records'));
      }
    },
    [confirm, mutation]
  );

  return { deleteFile, isPending: mutation.isPending };
}
