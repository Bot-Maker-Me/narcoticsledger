import { useState, useMemo, useRef } from 'react';
import {
  Package,
  Search,
  Plus,
  AlertTriangle,
  Pencil,
  Trash2,
  ChevronDown,
  X,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useDrugs, useDeleteDrug, useUpdatePackSize } from '@/hooks/useDrugs';
import { SCHEDULES, type DrugWithStock, type DrugSchedule } from '@/types/drug';
import type { TransactionType } from '@/types/transaction';
import DrugModal from '@/components/DrugModal';
import TransactionModal from '@/components/TransactionModal';
import Tooltip from '@/components/Tooltip';

const scheduleStyles: Record<DrugSchedule, string> = {
  Narcotic: 'bg-error-50 text-error-700',
  Controlled: 'bg-warning-50 text-warning-700',
  Targeted: 'bg-secondary-50 text-secondary-700',
  Verify: 'bg-neutral-100 text-neutral-600',
};

function getStockStatus(stock: number, reorderLevel: number) {
  if (stock <= 0) return { label: 'Out of Stock', style: 'bg-error-50 text-error-700', showIcon: false };
  if (stock <= reorderLevel)
    return { label: 'Low Stock', style: 'bg-warning-50 text-warning-700', showIcon: true };
  return { label: 'In Stock', style: 'bg-success-50 text-success-700', showIcon: false };
}

function SkeletonRow() {
  return (
    <tr className="border-b border-neutral-50">
      <td className="px-4 py-3.5">
        <div className="h-4 w-20 animate-pulse rounded bg-neutral-100" />
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-lg bg-neutral-100" />
          <div className="h-4 w-32 animate-pulse rounded bg-neutral-100" />
        </div>
      </td>
      <td className="px-4 py-3.5"><div className="h-5 w-16 animate-pulse rounded-full bg-neutral-100" /></td>
      <td className="px-4 py-3.5"><div className="h-4 w-12 animate-pulse rounded bg-neutral-100" /></td>
      <td className="px-4 py-3.5"><div className="h-4 w-10 animate-pulse rounded bg-neutral-100" /></td>
      <td className="px-4 py-3.5"><div className="h-4 w-16 animate-pulse rounded bg-neutral-100" /></td>
      <td className="px-4 py-3.5"><div className="h-4 w-24 animate-pulse rounded bg-neutral-100" /></td>
    </tr>
  );
}

export default function Inventory() {
  const { data: drugs, isLoading, isError, refetch } = useDrugs();
  const deleteMutation = useDeleteDrug();
  const packSizeMutation = useUpdatePackSize();

  const [search, setSearch] = useState('');
  const [scheduleFilter, setScheduleFilter] = useState<DrugSchedule | 'All'>('All');
  const [filterOpen, setFilterOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDrug, setEditingDrug] = useState<DrugWithStock | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DrugWithStock | null>(null);
  const [packEdit, setPackEdit] = useState<{ id: string; value: string } | null>(null);
  const skipPackCommit = useRef(false);
  const [transactionModal, setTransactionModal] = useState<{
    drug: DrugWithStock;
    type: TransactionType;
  } | null>(null);

  const filtered = useMemo(() => {
    if (!drugs) return [];
    return drugs.filter((drug) => {
      const matchesSearch =
        drug.din.includes(search) || drug.description.toLowerCase().includes(search.toLowerCase());
      const matchesSchedule = scheduleFilter === 'All' || drug.schedule === scheduleFilter;
      return matchesSearch && matchesSchedule;
    });
  }, [drugs, search, scheduleFilter]);

  const handleEdit = (drug: DrugWithStock) => {
    setEditingDrug(drug);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setEditingDrug(null);
    setModalOpen(true);
  };

  // Pack size decides how quantities from files and manual entries become total units.
  const commitPackSize = async (drug: DrugWithStock) => {
    if (skipPackCommit.current) {
      skipPackCommit.current = false;
      return;
    }
    if (!packEdit || packEdit.id !== drug.id) return;

    const packSize = parseInt(packEdit.value);
    setPackEdit(null);
    if (!Number.isFinite(packSize) || packSize < 1 || packSize === drug.pack_size) return;

    try {
      await packSizeMutation.mutateAsync({ id: drug.id, packSize });
      toast.success(`${drug.description}: pack size ${packSize}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update pack size';
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success('Drug removed from inventory');
      setDeleteTarget(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete drug';
      toast.error(message);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Drug Inventory</h1>
          <p className="mt-1 text-sm text-neutral-500">Manage your drug catalog and stock levels</p>
        </div>
        <button className="btn-primary mt-4 sm:mt-0" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
          Add Drug
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
              placeholder="Search by DIN or description..."
              className="input-field pl-10"
            />
          </div>

          <div className="relative">
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className="btn-secondary w-full justify-between sm:w-auto"
            >
              <span className="flex items-center gap-2">
                <span className="text-neutral-400">Schedule:</span>
                {scheduleFilter}
              </span>
              <ChevronDown className="h-4 w-4" />
            </button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setFilterOpen(false)} />
                <div className="absolute right-0 top-full z-40 mt-2 w-44 animate-slide-up rounded-lg border border-neutral-100 bg-white shadow-elevated">
                  {(['All', ...SCHEDULES] as const).map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setScheduleFilter(option);
                        setFilterOpen(false);
                      }}
                      className={`flex w-full items-center px-4 py-2.5 text-sm transition-colors hover:bg-neutral-50 ${
                        scheduleFilter === option
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

          {scheduleFilter !== 'All' && (
            <button
              onClick={() => setScheduleFilter('All')}
              className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-700"
            >
              <X className="h-3 w-3" />
              Clear filter
            </button>
          )}
        </div>

        {/* Error state */}
        {isError && (
          <div className="py-12 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-error-300" />
            <p className="mt-3 text-sm text-neutral-500">Failed to load drugs</p>
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
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">DIN</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Schedule</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Current Stock</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    <Tooltip content="Quantity × pack size = total units recorded from imported files and manual entries. Use 1 to record quantities as entered.">
                      <span>Pack Size</span>
                    </Tooltip>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Reorder Level</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {isLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

                {!isLoading &&
                  filtered.map((drug) => {
                    const stockStatus = getStockStatus(drug.current_stock, drug.reorder_level);
                    return (
                      <tr key={drug.id} className="transition-colors hover:bg-neutral-50/50">
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm font-medium text-neutral-700">{drug.din}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50">
                              <Package className="h-4 w-4 text-primary-600" />
                            </div>
                            <span className="text-sm font-medium text-neutral-800">{drug.description}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${scheduleStyles[drug.schedule]}`}
                          >
                            {drug.schedule}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-neutral-700">
                              {drug.current_stock}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${stockStatus.style}`}
                            >
                              {stockStatus.showIcon && <AlertTriangle className="h-3 w-3" />}
                              {stockStatus.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {packEdit?.id === drug.id ? (
                            <input
                              type="number"
                              min={1}
                              autoFocus
                              value={packEdit.value}
                              onChange={(e) => setPackEdit({ id: drug.id, value: e.target.value })}
                              onBlur={() => commitPackSize(drug)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                                if (e.key === 'Escape') {
                                  skipPackCommit.current = true;
                                  setPackEdit(null);
                                }
                              }}
                              className="w-20 rounded border border-primary-400 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                            />
                          ) : (
                            <Tooltip
                              content={
                                drug.pack_size > 1
                                  ? `Imported and manual quantities are multiplied by ${drug.pack_size} to record total units`
                                  : 'Quantities are recorded exactly as entered — click to set a pack size'
                              }
                            >
                              <button
                                onClick={() => setPackEdit({ id: drug.id, value: String(drug.pack_size) })}
                                className={`rounded px-2 py-1 text-sm transition-colors hover:bg-primary-50 hover:text-primary-600 ${
                                  drug.pack_size > 1
                                    ? 'font-semibold text-primary-700'
                                    : 'text-neutral-600'
                                }`}
                              >
                                {drug.pack_size > 1 ? `×${drug.pack_size}` : drug.pack_size}
                              </button>
                            </Tooltip>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-600">{drug.reorder_level}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setTransactionModal({ drug, type: 'PURCHASE' })}
                              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-success-50 hover:text-success-600"
                              title="Add Purchase"
                            >
                              <TrendingUp className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setTransactionModal({ drug, type: 'DISPENSE' })}
                              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-error-50 hover:text-error-600"
                              title="Reduce Stock"
                            >
                              <TrendingDown className="h-4 w-4" />
                            </button>
                            <div className="mx-1 h-5 w-px bg-neutral-100" />
                            <button
                              onClick={() => handleEdit(drug)}
                              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-primary-50 hover:text-primary-600"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(drug)}
                              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-error-50 hover:text-error-600"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
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
                <Package className="mx-auto h-10 w-10 text-neutral-300" />
                <p className="mt-3 text-sm text-neutral-400">
                  {drugs && drugs.length > 0
                    ? 'No drugs match your search'
                    : 'No drugs in inventory yet'}
                </p>
                {drugs && drugs.length === 0 && (
                  <button onClick={handleAdd} className="btn-primary mt-4">
                    <Plus className="h-4 w-4" />
                    Add your first drug
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Drug Modal */}
      <DrugModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editingDrug={editingDrug}
      />

      {/* Transaction Modal */}
      {transactionModal && (
        <TransactionModal
          open={!!transactionModal}
          onClose={() => setTransactionModal(null)}
          drug={transactionModal.drug}
          type={transactionModal.type}
        />
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
                <Trash2 className="h-6 w-6 text-error-500" />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900">Delete drug?</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Are you sure you want to remove{' '}
                <span className="font-medium text-neutral-700">{deleteTarget.description}</span> (DIN:{' '}
                {deleteTarget.din}) from your inventory? This cannot be undone.
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
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
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
