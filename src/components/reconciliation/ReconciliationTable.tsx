import { useMemo } from 'react';
import {
  ChevronLeft,
  FileDown,
  Download,
  Search,
  Edit3,
  Check,
  Undo,
  Redo,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToCSV, exportToPDF } from '@/lib/exportUtils';
import type { ReconciliationItemDraft, CycleFormData } from '@/types/reconciliation';
import { flagStyles } from '@/components/reconciliation/shared';

export interface TableViewProps {
  items: ReconciliationItemDraft[];
  filteredItems: ReconciliationItemDraft[];
  cycleForm: CycleFormData;
  onFormChange: (form: CycleFormData) => void;
  onActualCountChange: (index: number, value: string) => void;
  onNoteChange: (index: number, value: string) => void;
  onSave: () => void;
  onBack: () => void;
  saving: boolean;
  onSearchChange: (query: string) => void;
  onToggleBulkEdit: () => void;
  bulkEditMode: boolean;
  onToggleSelectAll: () => void;
  allSelected: boolean;
  selectedCount: number;
  onToggleItemSelection: (index: number) => void;
  onBulkEdit: (value: number | null) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onVerifyItem: (index: number) => void;
  verifyModalOpen: boolean;
  onCloseVerifyModal: () => void;
  verifyNote: string;
  onVerifyNoteChange: (note: string) => void;
  onSaveVerifyNote: () => void;
  searchQuery: string;
  onOpenLocations: (din: string) => void;
  editingIndex: number | null;
  editingField: 'opening' | 'purchased' | 'dispensed' | null;
  onEditClick: (index: number, field: 'opening' | 'purchased' | 'dispensed') => void;
  onOpeningEdit: (index: number, value: string) => void;
  onPurchasedEdit: (index: number, value: string) => void;
  onDispensedEdit: (index: number, value: string) => void;
  onEditBlur: () => void;
}

export function TableView(props: TableViewProps) {
  const stats = useMemo(() => {
    let pending = 0, ok = 0, review = 0, verify = 0;
    for (const item of props.items) {
      if (item.flag === 'Pending count') pending++;
      else if (item.flag === 'OK') ok++;
      else if (item.flag === 'Review') review++;
      else if (item.flag === 'Verify') verify++;
    }
    return { pending, ok, review, verify };
  }, [props.items]);

  const progress = useMemo(() => {
    if (props.items.length === 0) return 0;
    const counted = props.items.filter(item => item.actual_count !== null).length;
    return Math.round((counted / props.items.length) * 100);
  }, [props.items]);

  // Rows can be filtered by the search box, so map each DIN back to its
  // position in the full item list to keep edits pointed at the right row.
  const indexByDin = useMemo(() => {
    const map = new Map<string, number>();
    props.items.forEach((item, i) => map.set(item.din, i));
    return map;
  }, [props.items]);

  const handleExportCSV = () => {
    exportToCSV(props.items);
    toast.success('CSV exported successfully');
  };

  const handleExportPDF = () => {
    exportToPDF(props.items);
    toast.success('PDF exported successfully');
  };

  return (
    <div>
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-neutral-900">Reconciliation Table</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {props.items.length} items · {progress}% counted
          </p>
        </div>
        <div className="mt-4 flex items-center gap-2 sm:mt-0">
          <button className="btn-secondary" onClick={props.onBack}>
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <button className="btn-secondary" onClick={handleExportCSV}>
            <FileDown className="h-4 w-4" />
            Export CSV
          </button>
          <button className="btn-secondary" onClick={handleExportPDF}>
            <Download className="h-4 w-4" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4 card p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-neutral-700">Counting Progress</span>
          <span className="text-sm font-semibold text-primary-600">{progress}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
            className="h-full bg-primary-500"
          />
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-900/[0.4]" />
          <input
            type="text"
            placeholder="Search by DIN or description..."
            className="input-field pl-10"
            onChange={(e) => props.onSearchChange(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary"
            onClick={props.onToggleBulkEdit}
            style={{
              backgroundColor: props.bulkEditMode ? 'rgba(232, 90, 90, 0.14)' : undefined,
              borderColor: props.bulkEditMode ? '#E85A5A' : undefined,
            }}
          >
            <Edit3 className="h-4 w-4" />
            {props.bulkEditMode ? 'Exit Bulk Edit' : 'Bulk Edit'}
          </button>
          <button className="btn-secondary" onClick={props.onUndo} disabled={!props.canUndo} title="Undo">
            <Undo className="h-4 w-4" />
          </button>
          <button className="btn-secondary" onClick={props.onRedo} disabled={!props.canRedo} title="Redo">
            <Redo className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Bulk Edit Toolbar */}
      <AnimatePresence>
        {props.bulkEditMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 card p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <button className="btn-secondary text-xs" onClick={props.onToggleSelectAll}>
                  {props.allSelected ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-sm text-neutral-500">
                  {props.selectedCount} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Set count"
                  className="input-field w-32"
                  onChange={(e) => props.onBulkEdit(e.target.value ? parseInt(e.target.value) : null)}
                />
                <button
                  className="btn-primary text-xs"
                  onClick={() => props.onBulkEdit(null)}
                  disabled={props.selectedCount === 0}
                >
                  Apply
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-4 flex flex-wrap gap-3">
        <FlagBadge label="Pending" count={stats.pending} style="bg-neutral-100 text-neutral-600" />
        <FlagBadge label="OK" count={stats.ok} style="bg-success-50 text-success-700" />
        <FlagBadge label="Review" count={stats.review} style="bg-warning-50 text-warning-700" />
        <FlagBadge label="Verify" count={stats.verify} style="bg-error-50 text-error-700" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-100 bg-neutral-50/50">
                {props.bulkEditMode && (
                  <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 w-10">
                    <input
                      type="checkbox"
                      checked={props.allSelected}
                      onChange={props.onToggleSelectAll}
                      className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                )}
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">DIN</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Description</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Opening</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Purchased</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Dispensed</th>
                <th
                  className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-primary-600"
                  title="Total units for this DIN in this period (Opening + Purchased − Dispensed)"
                >
                  Total
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Expected</th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">Actual</th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">Variance</th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">Flag</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">Notes</th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500 w-10">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {props.filteredItems.map((item, index) => {
                const itemIndex = indexByDin.get(item.din) ?? index;
                const total = item.opening_balance + item.purchased_count - item.dispensed_count;
                const expected = total;
                const variance = item.actual_count !== null ? item.actual_count - expected : null;
                const hasVariance = variance !== null && variance !== 0;
                const isHighlighted = props.searchQuery && (
                  item.din.toLowerCase().includes(props.searchQuery.toLowerCase()) ||
                  item.description.toLowerCase().includes(props.searchQuery.toLowerCase())
                );

                return (
                  <tr
                    key={item.din}
                    className={`transition-colors hover:bg-neutral-50/50 ${
                      hasVariance ? 'bg-warning-50/30' : ''
                    } ${
                      isHighlighted ? 'bg-primary-50/50' : ''
                    }`}
                  >
                    {props.bulkEditMode && (
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={item.selected || false}
                          onChange={() => props.onToggleItemSelection(itemIndex)}
                          className="rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs font-medium text-neutral-700">{item.din}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-sm text-neutral-700">{item.description}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm text-neutral-600">
                      {props.editingIndex === itemIndex && props.editingField === 'opening' ? (
                        <input
                          type="number"
                          autoFocus
                          defaultValue={item.opening_balance}
                          onChange={(e) => props.onOpeningEdit(itemIndex, e.target.value)}
                          onBlur={props.onEditBlur}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          className="w-20 rounded border border-primary-400 px-2 py-1 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                          min="0"
                        />
                      ) : (
                        <span
                          onClick={() => props.onEditClick(itemIndex, 'opening')}
                          className="cursor-pointer hover:bg-primary-50 hover:text-primary-600 rounded px-2 py-1 transition-colors"
                          title="Click to edit opening count"
                        >
                          {item.opening_balance}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm text-success-600">
                      {props.editingIndex === itemIndex && props.editingField === 'purchased' ? (
                        <input
                          type="number"
                          autoFocus
                          defaultValue={item.purchased_count}
                          onChange={(e) => props.onPurchasedEdit(itemIndex, e.target.value)}
                          onBlur={props.onEditBlur}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          className="w-20 rounded border border-primary-400 px-2 py-1 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                          min="0"
                        />
                      ) : (
                        <span
                          onClick={() => props.onEditClick(itemIndex, 'purchased')}
                          className="cursor-pointer hover:bg-primary-50 hover:text-primary-600 rounded px-2 py-1 transition-colors"
                          title="Click to edit"
                        >
                          +{item.purchased_count}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm text-error-600">
                      {props.editingIndex === itemIndex && props.editingField === 'dispensed' ? (
                        <input
                          type="number"
                          autoFocus
                          defaultValue={item.dispensed_count}
                          onChange={(e) => props.onDispensedEdit(itemIndex, e.target.value)}
                          onBlur={props.onEditBlur}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.currentTarget.blur();
                            }
                          }}
                          className="w-20 rounded border border-primary-400 px-2 py-1 text-right text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                          min="0"
                        />
                      ) : (
                        <span
                          onClick={() => props.onEditClick(itemIndex, 'dispensed')}
                          className="cursor-pointer hover:bg-primary-50 hover:text-primary-600 rounded px-2 py-1 transition-colors"
                          title="Click to edit"
                        >
                          -{item.dispensed_count}
                        </span>
                      )}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right text-sm font-semibold text-primary-700 bg-primary-50/40"
                      title="Total units for this DIN (Opening + Purchased − Dispensed)"
                    >
                      {total}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm font-semibold text-neutral-700">{expected}</td>
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        min={0}
                        value={item.actual_count ?? ''}
                        onChange={(e) => props.onActualCountChange(itemIndex, e.target.value)}
                        placeholder="—"
                        className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-center text-sm text-neutral-800 placeholder:text-neutral-300 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {variance === null ? (
                        <span className="text-sm text-neutral-500">—</span>
                      ) : (
                        <span className={`text-sm font-semibold ${variance === 0 ? 'text-success-600' : variance < 0 ? 'text-error-600' : 'text-warning-600'}`}>
                          {variance > 0 ? '+' : ''}{variance}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${flagStyles[item.flag]}`}>
                        {item.flag}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="text"
                        value={item.note || ''}
                        onChange={(e) => props.onNoteChange(itemIndex, e.target.value)}
                        placeholder="Add note..."
                        className="w-full rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-800 placeholder:text-neutral-300 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => props.onVerifyItem(itemIndex)}
                        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                        title="Add verification note"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt-6 p-6">
        <h3 className="text-sm font-semibold text-neutral-800">Cycle Details</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-600">Start Date</label>
            <input
              type="date"
              value={props.cycleForm.start_date}
              onChange={(e) => props.onFormChange({ ...props.cycleForm, start_date: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-600">End Date</label>
            <input
              type="date"
              value={props.cycleForm.end_date}
              onChange={(e) => props.onFormChange({ ...props.cycleForm, end_date: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-600">Performed By</label>
            <input
              type="text"
              value={props.cycleForm.performed_by}
              onChange={(e) => props.onFormChange({ ...props.cycleForm, performed_by: e.target.value })}
              placeholder="e.g. Jane Smith"
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-600">Verified By</label>
            <input
              type="text"
              value={props.cycleForm.verified_by}
              onChange={(e) => props.onFormChange({ ...props.cycleForm, verified_by: e.target.value })}
              placeholder="e.g. Dr. John Doe"
              className="input-field"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-neutral-600">Notes</label>
            <textarea
              value={props.cycleForm.notes}
              onChange={(e) => props.onFormChange({ ...props.cycleForm, notes: e.target.value })}
              placeholder="Optional notes about this cycle..."
              className="input-field min-h-[60px] resize-y"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button className="btn-primary" onClick={props.onSave} disabled={props.saving}>
            {props.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {props.saving ? 'Saving...' : 'Save Cycle'}
          </button>
        </div>
      </div>

      {/* Verify Modal */}
      <AnimatePresence>
        {props.verifyModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
              onClick={props.onCloseVerifyModal}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md"
            >
              <div className="card p-6">
                <h3 className="text-lg font-semibold text-neutral-900">Add Verification Note</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Explain why this item needs verification
                </p>
                <textarea
                  value={props.verifyNote}
                  onChange={(e) => props.onVerifyNoteChange(e.target.value)}
                  placeholder="Enter verification reason..."
                  className="input-field mt-4 min-h-[100px] resize-y"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button className="btn-secondary" onClick={props.onCloseVerifyModal}>
                    Cancel
                  </button>
                  <button className="btn-primary" onClick={props.onSaveVerifyNote}>
                    <Check className="h-4 w-4" />
                    Save Note
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FlagBadge({ label, count, style }: { label: string; count: number; style: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${style}`}>
      {label}: {count}
    </span>
  );
}
