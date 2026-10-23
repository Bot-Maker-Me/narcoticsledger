import { useState, useMemo } from 'react';
import {
  FileText,
  Plus,
  Search,
  Pill,
  AlertTriangle,
  XCircle,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  usePrescriptions,
  useCancelPrescription,
  useDeletePrescription,
} from '@/hooks/usePrescriptions';
import type { PrescriptionWithDrug, PrescriptionStatus } from '@/types/prescription';
import PrescriptionModal from '@/components/PrescriptionModal';
import DispenseModal from '@/components/DispenseModal';

const statusConfig: Record<
  PrescriptionStatus,
  { style: string; label: string }
> = {
  active: { style: 'bg-success-50 text-success-700', label: 'Active' },
  completed: { style: 'bg-neutral-100 text-neutral-600', label: 'Completed' },
  cancelled: { style: 'bg-error-50 text-error-700', label: 'Cancelled' },
};

function SkeletonRow() {
  return (
    <tr className="border-b border-neutral-50">
      <td className="px-4 py-3.5"><div className="h-4 w-28 animate-pulse rounded bg-neutral-100" /></td>
      <td className="px-4 py-3.5"><div className="h-4 w-24 animate-pulse rounded bg-neutral-100" /></td>
      <td className="px-4 py-3.5"><div className="h-4 w-28 animate-pulse rounded bg-neutral-100" /></td>
      <td className="px-4 py-3.5"><div className="h-4 w-12 animate-pulse rounded bg-neutral-100" /></td>
      <td className="px-4 py-3.5"><div className="h-4 w-12 animate-pulse rounded bg-neutral-100" /></td>
      <td className="px-4 py-3.5"><div className="h-5 w-16 animate-pulse rounded-full bg-neutral-100" /></td>
      <td className="px-4 py-3.5"><div className="h-4 w-20 animate-pulse rounded bg-neutral-100" /></td>
    </tr>
  );
}

export default function Prescriptions() {
  const { data: prescriptions, isLoading, isError, refetch } = usePrescriptions();
  const cancelMutation = useCancelPrescription();
  const deleteMutation = useDeletePrescription();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PrescriptionStatus | 'All'>('All');
  const [filterOpen, setFilterOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [dispenseTarget, setDispenseTarget] = useState<PrescriptionWithDrug | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PrescriptionWithDrug | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PrescriptionWithDrug | null>(null);

  const filtered = useMemo(() => {
    if (!prescriptions) return [];
    return prescriptions.filter((rx) => {
      const matchesSearch =
        rx.patient_name.toLowerCase().includes(search.toLowerCase()) ||
        rx.drug_description.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'All' || rx.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [prescriptions, search, statusFilter]);

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await cancelMutation.mutateAsync(cancelTarget.id);
      toast.success('Prescription cancelled');
      setCancelTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel';
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success('Prescription deleted');
      setDeleteTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete';
      toast.error(message);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Prescriptions</h1>
          <p className="mt-1 text-sm text-neutral-500">Manage prescriptions and dispensing</p>
        </div>
        <button className="btn-primary mt-4 sm:mt-0" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          New Prescription
        </button>
      </div>

      <div className="card overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-neutral-100 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by patient or drug..."
              className="input-field pl-10"
            />
          </div>

          <div className="relative">
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className="btn-secondary w-full justify-between sm:w-auto"
            >
              <span className="flex items-center gap-2">
                <span className="text-neutral-400">Status:</span>
                {statusFilter}
              </span>
            </button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setFilterOpen(false)} />
                <div className="absolute right-0 top-full z-40 mt-2 w-40 animate-slide-up rounded-lg border border-neutral-100 bg-white shadow-elevated">
                  {(['All', 'active', 'completed', 'cancelled'] as const).map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setStatusFilter(option);
                        setFilterOpen(false);
                      }}
                      className={`flex w-full items-center px-4 py-2.5 text-sm capitalize transition-colors hover:bg-neutral-50 ${
                        statusFilter === option
                          ? 'font-medium text-primary-700'
                          : 'text-neutral-600'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Error state */}
        {isError && (
          <div className="py-12 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-error-300" />
            <p className="mt-3 text-sm text-neutral-500">Failed to load prescriptions</p>
            <button onClick={() => refetch()} className="btn-secondary mt-3">
              Try again
            </button>
          </div>
        )}

        {/* Table */}
        {!isError && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Patient</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Drug</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Prescriber</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Qty (Presc.)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Qty (Disp.)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Refills</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {isLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

                {!isLoading &&
                  filtered.map((rx) => {
                    const config = statusConfig[rx.status];
                    const remaining = rx.quantity_prescribed - rx.quantity_dispensed;
                    const canDispense = rx.status === 'active' && remaining > 0 && rx.drug_current_stock > 0;
                    return (
                      <tr key={rx.id} className="transition-colors hover:bg-neutral-50/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary-50">
                              <FileText className="h-4 w-4 text-secondary-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-neutral-800">{rx.patient_name}</p>
                              {rx.image_url && (
                                <a
                                  href={rx.image_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary-500 hover:text-primary-700"
                                >
                                  View image
                                </a>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Pill className="h-3.5 w-3.5 text-neutral-400" />
                            <span className="text-sm text-neutral-700">{rx.drug_description}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-600">{rx.prescriber}</td>
                        <td className="px-4 py-3 text-sm font-medium text-neutral-700">{rx.quantity_prescribed}</td>
                        <td className="px-4 py-3 text-sm text-neutral-600">{rx.quantity_dispensed}</td>
                        <td className="px-4 py-3">
                          {rx.refills_remaining === 0 ? (
                            <span className="text-xs font-medium text-neutral-400">No refills</span>
                          ) : (
                            <span className="text-sm text-neutral-700">{rx.refills_remaining}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${config.style}`}>
                            {config.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {rx.status === 'active' && (
                              <button
                                onClick={() => setDispenseTarget(rx)}
                                disabled={!canDispense}
                                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-30"
                                title={canDispense ? 'Dispense' : 'Cannot dispense — no stock or remaining quantity'}
                              >
                                Dispense
                              </button>
                            )}
                            {rx.status === 'active' && (
                              <button
                                onClick={() => setCancelTarget(rx)}
                                className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-warning-50 hover:text-warning-600"
                                title="Cancel prescription"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => setDeleteTarget(rx)}
                              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-error-50 hover:text-error-600"
                              title="Delete"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>

            {!isLoading && filtered.length === 0 && (
              <div className="py-16 text-center">
                <FileText className="mx-auto h-10 w-10 text-neutral-300" />
                <p className="mt-3 text-sm text-neutral-400">
                  {prescriptions && prescriptions.length > 0
                    ? 'No prescriptions match your search'
                    : 'No prescriptions yet'}
                </p>
                {prescriptions && prescriptions.length === 0 && (
                  <button onClick={() => setModalOpen(true)} className="btn-primary mt-4">
                    <Plus className="h-4 w-4" />
                    Create your first prescription
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Prescription Modal */}
      <PrescriptionModal open={modalOpen} onClose={() => setModalOpen(false)} />

      {/* Dispense Modal */}
      {dispenseTarget && (
        <DispenseModal
          open={!!dispenseTarget}
          onClose={() => setDispenseTarget(null)}
          prescription={dispenseTarget}
        />
      )}

      {/* Cancel Confirmation */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm animate-fade-in"
            onClick={() => setCancelTarget(null)}
          />
          <div className="relative w-full max-w-sm animate-slide-up">
            <div className="card p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-warning-50">
                <XCircle className="h-6 w-6 text-warning-500" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900">Cancel prescription?</h3>
              <p className="mt-1 text-sm text-neutral-500">
                This will cancel the prescription for{' '}
                <span className="font-medium text-neutral-700">{cancelTarget.patient_name}</span>.
                This cannot be undone.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button onClick={() => setCancelTarget(null)} className="btn-secondary">
                  Keep active
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelMutation.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-warning-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-warning-700 active:scale-[0.98] disabled:opacity-50"
                >
                  {cancelMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  Cancel prescription
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm animate-fade-in"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative w-full max-w-sm animate-slide-up">
            <div className="card p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-error-50">
                <XCircle className="h-6 w-6 text-error-500" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900">Delete prescription?</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Permanently delete the prescription for{' '}
                <span className="font-medium text-neutral-700">{deleteTarget.patient_name}</span>?
                This cannot be undone.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button onClick={() => setDeleteTarget(null)} className="btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-error-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-error-700 active:scale-[0.98] disabled:opacity-50"
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
