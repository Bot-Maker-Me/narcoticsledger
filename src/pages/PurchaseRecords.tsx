import { useState } from 'react';
import { Loader2, FileSpreadsheet, Trash2, Filter, X, ChevronDown } from 'lucide-react';
import { useImportedRecords, useDeleteImportedFile, type ImportedRecordRow } from '@/hooks/useImportedRecords';
import { isSameDin } from '@/lib/dinReference';
import { formatLedgerDate, parseLedgerDate } from '@/lib/ledgerDate';
import DinMonthlyTotal from '@/components/DinMonthlyTotal';
import toast from 'react-hot-toast';
import SectionMarker from '@/components/SectionMarker';

const PURCHASE_FILTER_OPTIONS = [
  { value: 'date', label: 'Date' },
  { value: 'invoiceNumber', label: 'Invoice Number' },
  { value: 'din', label: 'DIN' },
  { value: 'qty', label: 'Qty' },
  { value: 'description', label: 'Description' },
];

const DISPENSE_FILTER_OPTIONS = [
  { value: 'rx', label: 'RX' },
  { value: 'qty', label: 'Qty' },
  { value: 'drug', label: 'Drug' },
  { value: 'din', label: 'DIN' },
  { value: 'fillDate', label: 'Fill Date' },
];

export default function PurchaseRecords() {
  const { data: savedRecords, isLoading: savedLoading } = useImportedRecords('purchase');
  const deleteMutation = useDeleteImportedFile('purchase');

  const [filters, setFilters] = useState({
    date: '',
    invoiceNumber: '',
    din: '',
    qty: '',
    description: '',
  });

  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

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
      date: '',
      invoiceNumber: '',
      din: '',
      qty: '',
      description: '',
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
      if (filters.date) {
        const recordDate = parseLedgerDate(record.created_at)?.toLocaleDateString().toLowerCase() ?? '';
        if (!recordDate.includes(filters.date.toLowerCase())) return false;
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
      if (filters.description && !record.description?.toLowerCase().includes(filters.description.toLowerCase())) {
        return false;
      }
      // Invoice number filtering would need additional field in database
      if (filters.invoiceNumber) {
        // For now, this would filter by any field containing the invoice number
        const searchValue = filters.invoiceNumber.toLowerCase();
        const matchesDin = record.din.toLowerCase().includes(searchValue);
        const matchesDesc = record.description?.toLowerCase().includes(searchValue);
        if (!matchesDin && !matchesDesc) return false;
      }
      return true;
    });
  };

  const filteredRecords = filterRecords(savedRecords);

  return (
    <div>
      <div className="mb-6">
        <SectionMarker index="01" label="Purchase Records" />
        <h1 className="mt-4 font-display text-3xl text-neutral-900">Purchase Records</h1>
        <p className="mt-1 text-sm text-neutral-500">View all uploaded purchase records (raw data from files)</p>
      </div>

      <DinMonthlyTotal records={savedRecords} loading={savedLoading} label="Purchased" />

      {/* Filter Section */}
      <div className="mb-6 card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-surface px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              <Filter className="h-4 w-4" />
              Filter
              <ChevronDown className="h-4 w-4" />
            </button>

            {showFilterDropdown && (
              <div className="absolute top-full left-0 mt-2 w-48 rounded-lg border border-neutral-200 bg-surface shadow-elevated z-10">
                {PURCHASE_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      toggleFilter(option.value);
                      setShowFilterDropdown(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      activeFilters.includes(option.value)
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      {option.label}
                      {activeFilters.includes(option.value) && <span className="text-xs">✓</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilters.map((filterValue) => (
                <div key={filterValue} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-surface px-3 py-2">
                  <span className="text-xs font-medium text-neutral-600">
                    {PURCHASE_FILTER_OPTIONS.find(o => o.value === filterValue)?.label}
                  </span>
                  <input
                    type="text"
                    placeholder="Search..."
                    value={filters[filterValue as keyof typeof filters]}
                    onChange={(e) => handleFilterChange(filterValue, e.target.value)}
                    className="w-24 rounded border border-neutral-200 px-2 py-1 text-xs focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100"
                  />
                  <button
                    onClick={() => toggleFilter(filterValue)}
                    className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
                    title="Remove filter"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={clearFilters}
                className="rounded-lg px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
              >
                Clear All
              </button>
            </div>
          )}

          {filteredRecords && filteredRecords.length !== savedRecords?.length && (
            <span className="text-xs text-neutral-500">
              Showing {filteredRecords.length} of {savedRecords?.length} records
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
            <FileSpreadsheet className="mx-auto h-12 w-12 text-neutral-300" />
            <p className="mt-4 text-sm text-neutral-400">No purchase records uploaded yet</p>
            <p className="mt-2 text-xs text-neutral-400">Go to Upload File to add purchase records</p>
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
                    <FileSpreadsheet className="mx-auto h-12 w-12 text-neutral-300" />
                    <p className="mt-4 text-sm text-neutral-400">No purchase records uploaded yet</p>
                  </div>
                );
              }

              return Array.from(groupedRecords.entries()).map(([fileName, records]) => (
                <div key={fileName} className="border-b border-neutral-100 last:border-b-0">
                  <div className="flex items-center justify-between bg-neutral-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 text-neutral-500" />
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
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-neutral-100 bg-neutral-50/50">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">DIN</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Description</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Purchased</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((record) => (
                          <tr key={record.id} className="border-b border-neutral-50 hover:bg-neutral-50/50">
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