import { useEffect, useRef, useState } from 'react';
import { Loader2, FileText, Trash2, Filter, X, ChevronDown } from 'lucide-react';
import { useImportedRecords, useDeleteImportedFile, type ImportedRecordRow } from '@/hooks/useImportedRecords';
import { isSameDin } from '@/lib/dinReference';
import { formatLedgerDate, parseLedgerDate, toLedgerDateString } from '@/lib/ledgerDate';
import DinMonthlyTotal from '@/components/DinMonthlyTotal';
import toast from 'react-hot-toast';
import SectionMarker from '@/components/SectionMarker';

// The imported dispensing data carries DIN, description, quantity and date only.
const DISPENSE_FILTER_OPTIONS = [
  { value: 'qty', label: 'Qty' },
  { value: 'drug', label: 'Drug' },
  { value: 'din', label: 'DIN' },
  { value: 'fillDate', label: 'Fill Date' },
];

export default function DispensingRecords() {
  const { data: savedRecords, isLoading: savedLoading } = useImportedRecords('dispense');
  const deleteMutation = useDeleteImportedFile('dispense');

  const [filters, setFilters] = useState({
    qty: '',
    drug: '',
    din: '',
    fillDate: '',
  });

  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const filterRef = useRef<HTMLDivElement>(null);

  // Close the filter menu on an outside click or Escape.
  useEffect(() => {
    if (!showFilterDropdown) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowFilterDropdown(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showFilterDropdown]);

  const handleDeleteFile = async (fileName: string) => {
    if (!confirm(`Are you sure you want to delete all records from "${fileName}"? This will also remove them from Transaction History.`)) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(fileName);
      toast.success(`Deleted all records from "${fileName}"`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete records';
      toast.error(message);
    }
  };

  const handleFilterChange = (filterKey: string, value: string) => {
    setFilters(prev => ({ ...prev, [filterKey]: value }));
  };

  const clearFilters = () => {
    setFilters({
      qty: '',
      drug: '',
      din: '',
      fillDate: '',
    });
    setActiveFilters([]);
  };

  const toggleFilter = (filterValue: string) => {
    setActiveFilters(prev => {
      if (prev.includes(filterValue)) {
        // Remove filter and clear its value
        setFilters(current => ({ ...current, [filterValue]: '' }));
        return prev.filter(f => f !== filterValue);
      } else {
        // Add filter
        return [...prev, filterValue];
      }
    });
  };

  const filterRecords = (records: typeof savedRecords) => {
    if (!records) return records;

    return records.filter(record => {
      if (filters.fillDate) {
        // Accept "2026-02", "feb", "February 2026" or "2/26/2026".
        const parsed = parseLedgerDate(record.created_at);
        const needle = filters.fillDate.trim().toLowerCase();
        const haystack = parsed
          ? [
              formatLedgerDate(record.created_at),
              toLedgerDateString(parsed),
              parsed.toLocaleDateString(),
              `${parsed.toLocaleDateString('en-US', { month: 'long' })} ${parsed.getFullYear()}`,
            ]
              .join(' ')
              .toLowerCase()
          : '';
        if (!haystack.includes(needle)) return false;
      }
      if (filters.din && !isSameDin(record.din, filters.din) && !record.din.toLowerCase().includes(filters.din.toLowerCase())) {
        return false;
      }
      if (filters.qty) {
        // A DIN pasted into the Qty box finds that drug; otherwise match the quantity.
        const qtyFilter = filters.qty.trim();
        const looksLikeDin = qtyFilter.replace(/\D/g, '').length >= 6;
        const matches = looksLikeDin
          ? isSameDin(record.din, qtyFilter)
          : record.quantity.toString().includes(qtyFilter);
        if (!matches) return false;
      }
      if (filters.drug && !record.description?.toLowerCase().includes(filters.drug.toLowerCase())) {
        return false;
      }
      return true;
    });
  };

  const filteredRecords = filterRecords(savedRecords);
  const isFiltering = activeFilters.length > 0;

  return (
    <div>
      <div className="mb-6">
        <SectionMarker index="01" label="Dispensing Records" />
        <h1 className="mt-4 font-display text-3xl text-neutral-900">Dispensing Records</h1>
        <p className="mt-1 text-sm text-neutral-500">View all uploaded dispensing records (raw data from files)</p>
      </div>

      <DinMonthlyTotal records={savedRecords} loading={savedLoading} label="Dispensed" />

      {/* Filter Section — z-10 keeps the open menu above the records card below. */}
      <div className="card relative z-10 mb-6 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              aria-expanded={showFilterDropdown}
              aria-haspopup="menu"
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                isFiltering
                  ? 'border-primary-400 bg-primary-50 text-primary-700'
                  : 'border-white/15 bg-white/5 text-neutral-700 hover:bg-white/10 hover:text-neutral-900'
              }`}
            >
              <Filter className="h-4 w-4" />
              Filter
              <ChevronDown className={`h-4 w-4 transition-transform ${showFilterDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showFilterDropdown && (
              <div className="absolute left-0 top-full z-20 mt-2 max-h-72 w-52 animate-slide-up overflow-y-auto rounded-lg border border-white/10 bg-surface p-1 shadow-elevated">
                {DISPENSE_FILTER_OPTIONS.map((option) => {
                  const isActive = activeFilters.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      onClick={() => {
                        toggleFilter(option.value);
                        setShowFilterDropdown(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        isActive
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-neutral-600 hover:bg-white/5 hover:text-neutral-900'
                      }`}
                    >
                      {option.label}
                      {isActive && <span className="text-xs">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilters.map((filterValue) => (
                <div key={filterValue} className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">
                    {DISPENSE_FILTER_OPTIONS.find(o => o.value === filterValue)?.label}
                  </span>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={filters[filterValue as keyof typeof filters]}
                    onChange={(e) => handleFilterChange(filterValue, e.target.value)}
                    className="w-28 rounded border border-white/15 bg-ink-950/40 px-2 py-1 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/30"
                  />
                  <button
                    onClick={() => toggleFilter(filterValue)}
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
        {savedLoading ? (
          <div className="flex items-center justify-center py-12 text-neutral-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !savedRecords || savedRecords.length === 0 ? (
          <div className="py-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-neutral-300" />
            <p className="mt-4 text-sm text-neutral-400">No dispensing records uploaded yet</p>
            <p className="mt-2 text-xs text-neutral-400">Go to Upload File to add dispensing records</p>
          </div>
        ) : (
          <div>
            {(() => {
              const groupedRecords = new Map<string, ImportedRecordRow[]>();
              (filteredRecords ?? []).forEach(record => {
                const fileName = record.file_name || `Imported ${formatLedgerDate(record.created_at)}`;
                if (!groupedRecords.has(fileName)) {
                  groupedRecords.set(fileName, []);
                }
                groupedRecords.get(fileName)!.push(record);
              });

              if (groupedRecords.size === 0) {
                return (
                  <div className="py-12 text-center">
                    <FileText className="mx-auto h-12 w-12 text-neutral-300" />
                    {isFiltering ? (
                      <>
                        <p className="mt-4 text-sm text-neutral-400">No records match the current filters</p>
                        <button onClick={clearFilters} className="btn-secondary mt-4">
                          Clear filters
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="mt-4 text-sm text-neutral-400">No dispensing records uploaded yet</p>
                        <p className="mt-2 text-xs text-neutral-400">Go to Upload File to add dispensing records</p>
                      </>
                    )}
                  </div>
                );
              }

              return Array.from(groupedRecords.entries()).map(([fileName, records]) => (
                <div key={fileName} className="border-b border-white/5 last:border-b-0">
                  <div className="flex items-center justify-between border-b border-white/5 bg-ink-850 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary-500" />
                      <span className="text-sm font-medium text-neutral-800">{fileName}</span>
                      <span className="text-xs text-neutral-500">({records.length} rows)</span>
                    </div>
                    <button
                      onClick={() => handleDeleteFile(fileName)}
                      disabled={deleteMutation.isPending}
                      className="rounded p-1.5 text-neutral-400 transition-colors hover:bg-error-50 hover:text-error-600 disabled:opacity-50"
                      title="Delete all records from this file"
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {/* Bounded scroll area so a 6,000-row file does not run the page off the screen. */}
                  <div className="max-h-[70vh] overflow-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="sticky top-0 z-10 border-b border-white/10 bg-ink-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">DIN</th>
                          <th className="sticky top-0 z-10 border-b border-white/10 bg-ink-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Description</th>
                          <th className="sticky top-0 z-10 border-b border-white/10 bg-ink-900 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Dispensed</th>
                          <th className="sticky top-0 z-10 border-b border-white/10 bg-ink-900 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((record) => (
                          <tr key={record.id} className="border-b border-white/5 transition-colors hover:bg-white/5">
                            <td className="px-4 py-3 text-sm font-mono text-neutral-800">{record.din}</td>
                            <td className="px-4 py-3 text-sm text-neutral-600">{record.description}</td>
                            <td className="px-4 py-3 text-right text-sm text-neutral-600">{record.quantity}</td>
                            <td className="px-4 py-3 text-right text-xs text-neutral-400">
                              {formatLedgerDate(record.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
