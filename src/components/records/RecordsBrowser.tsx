import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';
import SectionMarker from '@/components/SectionMarker';
import DinMonthlyTotal from '@/components/DinMonthlyTotal';
import EmptyState from '@/components/ui/EmptyState';
import SavedFilesList from '@/components/records/SavedFilesList';
import { RECORD_KINDS, type RecordFilterKey } from '@/components/records/config';
import { useImportedRecords, type ImportKind, type ImportedRecordRow } from '@/hooks/useImportedRecords';
import { useDeleteImportedFile } from '@/hooks/useDeleteImportedFile';
import { isSameDin, looksLikeDin } from '@/lib/din';
import { formatMonthYear } from '@/lib/dates';
import { formatLedgerDate, parseLedgerDate, toLedgerDateString } from '@/lib/ledgerDate';

type Filters = Record<RecordFilterKey, string>;

const EMPTY_FILTERS: Filters = { date: '', din: '', qty: '', description: '' };

/**
 * The read-only view of one record kind: monthly DIN total, a filter bar and the
 * uploaded files grouped by file name.
 *
 * Purchase and dispensing records previously had a 333-line page each whose only real
 * differences were the copy and the filter labels.
 */
export default function RecordsBrowser({ kind }: { kind: ImportKind }) {
  const meta = RECORD_KINDS[kind];
  const { data: savedRecords, isLoading } = useImportedRecords(kind);
  const { deleteFile, isPending: deleting } = useDeleteImportedFile(kind);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [activeFilters, setActiveFilters] = useState<RecordFilterKey[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Close the filter menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const toggleFilter = (key: RecordFilterKey) => {
    setActiveFilters((previous) => {
      if (previous.includes(key)) {
        setFilters((current) => ({ ...current, [key]: '' }));
        return previous.filter((value) => value !== key);
      }
      return [...previous, key];
    });
    setMenuOpen(false);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setActiveFilters([]);
  };

  // The filter scans every ledger row, which is tens of thousands of them, so it runs on a
  // deferred copy of the values: the boxes stay responsive while typing and the list
  // catches up a moment later.
  const deferredFilters = useDeferredValue(filters);

  const filteredRecords = useMemo(() => {
    if (!savedRecords) return savedRecords;
    if (activeFilters.length === 0) return savedRecords;

    return savedRecords.filter((record) => matchesFilters(record, deferredFilters));
  }, [savedRecords, deferredFilters, activeFilters]);

  const isFiltering = activeFilters.length > 0;
  const Icon = meta.icon;

  return (
    <div>
      <div className="mb-6">
        <SectionMarker label={meta.title} />
        <h1 className="mt-4 font-display text-3xl text-neutral-900">{meta.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{meta.subtitle}</p>
      </div>

      <DinMonthlyTotal records={savedRecords} loading={isLoading} label={meta.quantityLabel} />

      {/* z-10 keeps the open filter menu above the records card below. */}
      <div className="card relative z-10 mb-6 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                isFiltering
                  ? 'border-primary-400 bg-primary-50 text-primary-700'
                  : 'border-white/15 bg-white/5 text-neutral-700 hover:bg-white/10 hover:text-neutral-900'
              }`}
            >
              <Filter className="h-4 w-4" />
              Filter
              <ChevronDown className={`h-4 w-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuOpen && (
              <div className="absolute left-0 top-full z-20 mt-2 max-h-72 w-52 animate-slide-up overflow-y-auto rounded-lg border border-white/10 bg-surface p-1 shadow-elevated">
                {meta.filterOptions.map((option) => {
                  const active = activeFilters.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      onClick={() => toggleFilter(option.value)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-neutral-600 hover:bg-white/5 hover:text-neutral-900'
                      }`}
                    >
                      {option.label}
                      {active && <span className="text-xs">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {isFiltering && (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilters.map((key) => (
                <div
                  key={key}
                  className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5"
                >
                  <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">
                    {meta.filterOptions.find((option) => option.value === key)?.label}
                  </span>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={filters[key]}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, [key]: event.target.value }))
                    }
                    className="w-28 rounded border border-white/15 bg-ink-950/40 px-2 py-1 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/30"
                  />
                  <button
                    onClick={() => toggleFilter(key)}
                    className="rounded p-1 text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-700"
                    title="Remove filter"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={clearFilters}
                className="rounded-lg px-3 py-2 text-xs font-medium text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-800"
              >
                Clear All
              </button>
            </div>
          )}

          {isFiltering && savedRecords && (
            <span className="text-xs text-neutral-500">
              Showing {filteredRecords?.length ?? 0} of {savedRecords.length} records
            </span>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <SavedFilesList
          records={filteredRecords}
          loading={isLoading}
          icon={Icon}
          quantityLabel={meta.quantityLabel}
          scrollable
          onDeleteFile={deleteFile}
          deleting={deleting}
          renderEmpty={() =>
            isFiltering ? (
              <EmptyState
                icon={Icon}
                title="No records match the current filters"
                action={
                  <button onClick={clearFilters} className="btn-secondary">
                    Clear filters
                  </button>
                }
              />
            ) : (
              <EmptyState icon={Icon} title={meta.emptyTitle} description={meta.emptyDescription} />
            )
          }
        />
      </div>
    </div>
  );
}

/** Applies the active filter values to one record. */
function matchesFilters(record: ImportedRecordRow, filters: Filters): boolean {
  if (filters.date) {
    // Accept "2026-02", "feb", "February 2026" or "2/26/2026".
    const parsed = parseLedgerDate(record.created_at);
    const haystack = parsed
      ? [
          formatLedgerDate(record.created_at),
          toLedgerDateString(parsed),
          parsed.toLocaleDateString(),
          formatMonthYear(parsed),
        ]
          .join(' ')
          .toLowerCase()
      : '';
    if (!haystack.includes(filters.date.trim().toLowerCase())) return false;
  }

  if (filters.din) {
    const needle = filters.din.toLowerCase();
    if (!isSameDin(record.din, filters.din) && !record.din.toLowerCase().includes(needle)) return false;
  }

  if (filters.qty) {
    // A DIN pasted into the Qty box finds that drug; otherwise match the quantity.
    const needle = filters.qty.trim();
    const matches = looksLikeDin(needle)
      ? isSameDin(record.din, needle)
      : record.quantity.toString().includes(needle);
    if (!matches) return false;
  }

  if (filters.description) {
    if (!record.description?.toLowerCase().includes(filters.description.toLowerCase())) return false;
  }

  return true;
}
