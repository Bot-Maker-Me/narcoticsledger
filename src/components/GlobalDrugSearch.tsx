import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, Package, TrendingUp, TrendingDown, Calendar, Clock } from 'lucide-react';
import { useDrugs } from '@/hooks/useDrugs';
import { useAllReconciliationItems } from '@/hooks/useReconciliation';
import type { DrugWithStock } from '@/types/drug';

interface DrugSearchResult {
  drug: DrugWithStock;
  lastUpdated?: string;
  totalPurchases?: number;
  totalDispenses?: number;
}

export default function GlobalDrugSearch() {
  const { data: drugs } = useDrugs();
  const { data: allReconciliationItems } = useAllReconciliationItems();
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDrug, setSelectedDrug] = useState<DrugSearchResult | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Calculate drug statistics
  const drugStats = useMemo(() => {
    if (!drugs || !allReconciliationItems) return new Map<string, DrugSearchResult>();

    const stats = new Map<string, DrugSearchResult>();
    
    for (const drug of drugs) {
      stats.set(drug.din, {
        drug,
        lastUpdated: drug.created_at,
        totalPurchases: 0,
        totalDispenses: 0,
      });
    }

    for (const item of allReconciliationItems) {
      const existing = stats.get(item.din);
      if (existing) {
        existing.totalPurchases = (existing.totalPurchases || 0) + item.purchased_count;
        existing.totalDispenses = (existing.totalDispenses || 0) + item.dispensed_count;
        
        // Update last updated if this item is more recent
        if (!existing.lastUpdated || new Date(item.created_at) > new Date(existing.lastUpdated)) {
          existing.lastUpdated = item.created_at;
        }
      }
    }

    return stats;
  }, [drugs, allReconciliationItems]);

  const filteredResults = useMemo(() => {
    if (!search || !drugStats) return [];
    const searchTerm = search.toLowerCase();
    
    return Array.from(drugStats.values()).filter(({ drug }) => 
      drug.din.includes(searchTerm) || 
      drug.description.toLowerCase().includes(searchTerm)
    ).slice(0, 8); // Limit to 8 results
  }, [search, drugStats]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectDrug = (result: DrugSearchResult) => {
    setSelectedDrug(result);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <>
      <div ref={searchRef} className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Search drugs by DIN or name..."
            className="w-64 rounded-lg border border-neutral-200 bg-surface px-9 py-2 text-sm transition-all focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100 lg:w-80"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                setIsOpen(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {isOpen && filteredResults.length > 0 && (
          <div className="absolute right-0 top-full z-50 mt-2 w-full max-w-md animate-slide-up rounded-lg border border-white/10 bg-surface shadow-elevated">
            <div className="max-h-96 overflow-y-auto">
              {filteredResults.map((result) => (
                <button
                  key={result.drug.id}
                  onClick={() => handleSelectDrug(result)}
                  className="flex w-full items-center gap-3 border-b border-neutral-50 px-4 py-3 text-left transition-colors last:border-0 hover:bg-neutral-50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50">
                    <Package className="h-5 w-5 text-primary-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-800">{result.drug.description}</p>
                    <p className="text-xs text-neutral-500">DIN: {result.drug.din}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-neutral-700">{result.drug.current_stock}</p>
                    <p className="text-xs text-neutral-400">in stock</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {isOpen && search && filteredResults.length === 0 && (
          <div className="absolute right-0 top-full z-50 mt-2 w-full max-w-md animate-slide-up rounded-lg border border-white/10 bg-surface p-4 shadow-elevated">
            <p className="text-center text-sm text-neutral-500">No drugs found matching "{search}"</p>
          </div>
        )}
      </div>

      {/* Drug Details Modal */}
      {selectedDrug && (
        <DrugDetailsModal 
          drugData={selectedDrug} 
          onClose={() => setSelectedDrug(null)} 
        />
      )}
    </>
  );
}

function DrugDetailsModal({ drugData, onClose }: { drugData: DrugSearchResult; onClose: () => void }) {
  const { drug, lastUpdated, totalPurchases, totalDispenses } = drugData;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl animate-slide-up">
        <div className="card overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-100 p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
                <Package className="h-6 w-6 text-primary-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-neutral-900">{drug.description}</h3>
                <p className="text-sm text-neutral-500">DIN: {drug.din}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Basic Info */}
            <div className="mb-6 grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-neutral-50 p-4">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Current Stock</p>
                <p className="mt-1 text-2xl font-bold text-neutral-900">{drug.current_stock}</p>
              </div>
              <div className="rounded-lg bg-neutral-50 p-4">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Reorder Level</p>
                <p className="mt-1 text-2xl font-bold text-neutral-900">{drug.reorder_level}</p>
              </div>
              <div className="rounded-lg bg-neutral-50 p-4">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Schedule</p>
                <p className="mt-1 text-lg font-semibold text-neutral-900">{drug.schedule}</p>
              </div>
              <div className="rounded-lg bg-neutral-50 p-4">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Last Updated</p>
                <p className="mt-1 text-sm font-medium text-neutral-700">
                  {lastUpdated ? new Date(lastUpdated).toLocaleDateString() : 'N/A'}
                </p>
              </div>
            </div>

            {/* Statistics */}
            <div className="mb-6">
              <h4 className="mb-3 text-sm font-semibold text-neutral-900">Transaction Statistics</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3 rounded-lg border border-neutral-100 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-50">
                    <TrendingUp className="h-5 w-5 text-success-600" />
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Total Purchases</p>
                    <p className="text-lg font-semibold text-neutral-900">{totalPurchases || 0}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-neutral-100 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-error-50">
                    <TrendingDown className="h-5 w-5 text-error-600" />
                  </div>
                  <div>
                    <p className="text-xs text-neutral-500">Total Dispenses</p>
                    <p className="text-lg font-semibold text-neutral-900">{totalDispenses || 0}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Info */}
            <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-4">
              <h4 className="mb-2 text-sm font-semibold text-neutral-900">Additional Information</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-neutral-600">
                  <Calendar className="h-4 w-4" />
                  <span>Added: {new Date(drug.created_at).toLocaleDateString()}</span>
                </div>
                {drug.description && (
                  <div className="flex items-start gap-2 text-neutral-600">
                    <Package className="h-4 w-4 mt-0.5" />
                    <span className="line-clamp-2">{drug.description}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end border-t border-neutral-100 p-4">
            <button onClick={onClose} className="btn-secondary">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}