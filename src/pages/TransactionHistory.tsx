import { useState } from 'react';
import {
  ArrowUpCircle,
  ArrowDownCircle,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Ban,
  Clock,
  Search,
  Filter,
  X,
} from 'lucide-react';
import { useFilteredTransactions } from '@/hooks/useTransactions';
import { formatLedgerDate } from '@/lib/ledgerDate';
import { getErrorMessage } from '@/lib/errors';
import type { TransactionType } from '@/types/transaction';
import SectionMarker from '@/components/SectionMarker';

const PAGE_SIZE = 10;

const typeConfig: Record<
  TransactionType,
  { icon: typeof ArrowUpCircle; style: string; label: string }
> = {
  PURCHASE: { icon: ArrowUpCircle, style: 'bg-success-50 text-success-700', label: 'Purchase' },
  DISPENSE: { icon: ArrowDownCircle, style: 'bg-error-50 text-error-700', label: 'Dispense' },
  ADJUSTMENT: { icon: SlidersHorizontal, style: 'bg-warning-50 text-warning-700', label: 'Adjustment' },
};

function SkeletonRow() {
  return (
    <tr className="border-b border-neutral-50">
      <td className="px-4 py-3.5"><div className="h-5 w-20 animate-pulse rounded-full bg-neutral-100" /></td>
      <td className="px-4 py-3.5"><div className="h-4 w-28 animate-pulse rounded bg-neutral-100" /></td>
      <td className="px-4 py-3.5"><div className="h-4 w-32 animate-pulse rounded bg-neutral-100" /></td>
      <td className="px-4 py-3.5"><div className="h-4 w-12 animate-pulse rounded bg-neutral-100" /></td>
      <td className="px-4 py-3.5"><div className="h-4 w-24 animate-pulse rounded bg-neutral-100" /></td>
      <td className="px-4 py-3.5"><div className="h-4 w-32 animate-pulse rounded bg-neutral-100" /></td>
      <td className="px-4 py-3.5"><div className="h-4 w-28 animate-pulse rounded bg-neutral-100" /></td>
    </tr>
  );
}

export default function TransactionHistory() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionType | ''>('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, isError, error, refetch } = useFilteredTransactions({
    page,
    search: search || undefined,
    type: typeFilter || undefined,
    source: sourceFilter || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const transactions = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('');
    setSourceFilter('');
    setStartDate('');
    setEndDate('');
    setPage(0);
    setShowFilters(false);
  };

  const hasActiveFilters = search || typeFilter || sourceFilter || startDate || endDate;

  return (
    <div>
      <div className="mb-6">
        <SectionMarker index="01" label="Transactions" />
        <h1 className="mt-4 font-display text-3xl text-neutral-900">Transaction History</h1>
        <p className="mt-1 text-sm text-neutral-500">
          All inventory transactions ({totalCount} total)
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search by DIN or drug description..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="w-full rounded-lg border border-neutral-200 pl-10 pr-4 py-2.5 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
              showFilters || hasActiveFilters
                ? 'border-primary-400 bg-primary-50 text-primary-700'
                : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            <Filter className="h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-600 text-xs text-white">
                {[search, typeFilter, sourceFilter, startDate, endDate].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="card p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-neutral-700">Transaction Type</label>
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value as TransactionType | '');
                    setPage(0);
                  }}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">All Types</option>
                  <option value="PURCHASE">Purchase</option>
                  <option value="DISPENSE">Dispense</option>
                  <option value="ADJUSTMENT">Adjustment</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-neutral-700">Source</label>
                <select
                  value={sourceFilter}
                  onChange={(e) => {
                    setSourceFilter(e.target.value);
                    setPage(0);
                  }}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">All Sources</option>
                  <option value="purchase_import">Purchase Import</option>
                  <option value="dispense_import">Dispense Import</option>
                  <option value="destruction_import">Destruction Import</option>
                  <option value="manual">Manual Entry</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-neutral-700">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(0);
                  }}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-neutral-700">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(0);
                  }}
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>

            {hasActiveFilters && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-neutral-500">
                  {totalCount} transactions match your filters
                </p>
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
                >
                  <X className="h-3 w-3" />
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        {/* Error state */}
        {isError && (
          <div className="py-12 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-error-300" />
            <p className="mt-3 text-sm text-neutral-500">Failed to load transactions</p>
            <p className="mt-1 text-xs text-neutral-400">{getErrorMessage(error)}</p>
            <button onClick={() => refetch()} className="btn-secondary mt-3">
              Try again
            </button>
          </div>
        )}

        {!isError && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Drug</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">DIN</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Notes</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {isLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

                {!isLoading &&
                  transactions.map((tx) => {
                    const config = typeConfig[tx.type];
                    const TypeIcon = config.icon;
                    const isPositive = tx.quantity > 0;
                    return (
                      <tr
                        key={tx.id}
                        className={`transition-colors hover:bg-neutral-50/50 ${
                          tx.voided_at ? 'opacity-60' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.style}`}
                            >
                              <TypeIcon className="h-3 w-3" />
                              {config.label}
                            </span>
                            {tx.voided_at && (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-500"
                                title={`Voided ${formatLedgerDate(tx.voided_at)} — kept for the audit trail`}
                              >
                                <Ban className="h-3 w-3" />
                                Voided
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium text-neutral-800">
                            {tx.drug_description}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-neutral-500">{tx.drug_din}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-sm font-semibold ${
                              isPositive ? 'text-success-600' : 'text-error-600'
                            }`}
                          >
                            {isPositive ? '+' : ''}
                            {tx.quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-neutral-500">
                            {tx.source === 'purchase_import' ? 'Purchase Import' :
                             tx.source === 'dispense_import' ? 'Dispense Import' :
                             tx.source === 'destruction_import' ? 'Destruction Import' :
                             tx.source === 'manual' ? 'Manual' : tx.source}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-neutral-500">
                            {tx.notes || <span className="text-neutral-500">—</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-neutral-500">{formatLedgerDate(tx.created_at)}</span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>

            {!isLoading && !isError && transactions.length === 0 && (
              <div className="py-16 text-center">
                <Clock className="mx-auto h-10 w-10 text-neutral-300" />
                <p className="mt-3 text-sm text-neutral-400">
                  {hasActiveFilters ? 'No transactions match your filters' : 'No transactions yet'}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  {hasActiveFilters
                    ? 'Try adjusting your filters or search terms'
                    : 'Upload purchase or dispensing records to see transactions here'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {!isError && !isLoading && totalCount > 0 && (
          <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3">
            <p className="text-xs text-neutral-400">
              Page {page + 1} of {totalPages} · {totalCount} transactions
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={!hasPrev}
                className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasNext}
                className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
