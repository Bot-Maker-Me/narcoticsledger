import type { DrugSchedule } from '@/types/drug';
import type { PrescriptionStatus } from '@/types/prescription';
import type { ReconciliationFlag } from '@/types/reconciliation';

/**
 * The pure rules behind the Reports page: what each report contains, how it is shaped for
 * the preview table and the CSV export, and how the date range is applied.
 *
 * Nothing here touches React or the network, so it is unit-tested in
 * `src/lib/__tests__/reports.test.ts`. Keep the row shapes and the report definitions
 * together — the preview table, the record count and the export must always agree.
 */

export type ReportType = 'inventory' | 'dispensing' | 'reconciliation' | 'prescription' | 'schedule';

export type ReportRange = '7d' | '30d' | '90d' | 'all';

/** One exported/previewed row. Values are already display-ready. */
export type ReportCsvRow = Record<string, string | number | null>;

// These are type aliases rather than interfaces on purpose: an alias of an object literal
// gets an implicit index signature, so the rows can be assigned to `ReportCsvRow[]`, while
// an interface would not be.
export type InventoryReportRow = {
  din: string;
  description: string;
  schedule: DrugSchedule;
  currentStock: number;
  reorderLevel: number;
  packSize: number;
};

export type DispensingReportRow = {
  patientName: string;
  drugDescription: string;
  drugDIN: string;
  quantityPrescribed: number;
  quantityDispensed: number;
  prescriber: string;
  status: PrescriptionStatus;
  createdAt: string;
};

export type ReconciliationReportRow = {
  din: string;
  description: string;
  schedule: string;
  openingBalance: number;
  purchasedCount: number;
  dispensedCount: number;
  actualCount: number | null;
  flag: ReconciliationFlag;
  cycleDate: string;
};

/** One slice of the schedule-distribution pie. */
export type ScheduleSlice = { name: string; value: number; color: string };

/** The three data sets every report is built from. */
export interface ReportDataSets {
  inventory: InventoryReportRow[];
  dispensing: DispensingReportRow[];
  reconciliation: ReconciliationReportRow[];
}

export const SCHEDULE_COLORS = ['#E85A5A', '#8E9FC4', '#D6A85F', '#7BA88B', '#6B7DA6'] as const;

const REPORT_HEADERS: Record<ReportType, string[]> = {
  inventory: ['DIN', 'Description', 'Schedule', 'Current Stock', 'Reorder Level', 'Pack Size'],
  dispensing: ['Patient Name', 'Drug', 'DIN', 'Prescribed', 'Dispensed', 'Status', 'Date'],
  reconciliation: ['DIN', 'Description', 'Schedule', 'Opening', 'Purchased', 'Dispensed', 'Actual', 'Flag'],
  prescription: ['Patient Name', 'Drug', 'DIN', 'Prescriber', 'Prescribed', 'Dispensed', 'Status'],
  schedule: ['Schedule', 'Count', 'Percentage'],
};

/**
 * The start of a report's date window, or `null` for "all time".
 *
 * `inventory` is a current snapshot and has no date at all, so the range only ever narrows
 * the dated reports — `withinRange` should not be applied to inventory rows.
 */
export function rangeStart(range: ReportRange): Date | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** Whether a timestamp falls inside the window. Undated rows are excluded once a window is set. */
export function withinRange(value: string | null | undefined, start: Date | null): boolean {
  if (!start) return true;
  if (!value) return false;

  const time = new Date(value).getTime();
  return !Number.isNaN(time) && time >= start.getTime();
}

/** How many drugs sit in each schedule. */
export function countBySchedule(rows: InventoryReportRow[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row.schedule, (counts.get(row.schedule) ?? 0) + 1);
  }

  return counts;
}

/** The schedule-distribution pie data. */
export function scheduleSlices(rows: InventoryReportRow[]): ScheduleSlice[] {
  return [...countBySchedule(rows)].map(([name, value], index) => ({
    name,
    value,
    color: SCHEDULE_COLORS[index % SCHEDULE_COLORS.length],
  }));
}

export function reportHeaders(type: ReportType): string[] {
  return REPORT_HEADERS[type];
}

/**
 * The rows shown in the preview table (and exported): the first twenty, reshaped to the
 * column order the headers describe.
 */
export function reportRows(type: ReportType, sets: ReportDataSets): ReportCsvRow[] {
  const { inventory, dispensing, reconciliation } = sets;

  switch (type) {
    case 'inventory':
      return inventory.slice(0, 20).map((item) => ({
        din: item.din,
        description: item.description,
        schedule: item.schedule,
        currentStock: item.currentStock,
        reorderLevel: item.reorderLevel,
        packSize: item.packSize,
      }));

    case 'dispensing':
      return dispensing.slice(0, 20).map((item) => ({
        patientName: item.patientName,
        drugDescription: item.drugDescription,
        drugDIN: item.drugDIN,
        quantityPrescribed: item.quantityPrescribed,
        quantityDispensed: item.quantityDispensed,
        status: item.status,
        createdAt: new Date(item.createdAt).toLocaleDateString(),
      }));

    case 'reconciliation':
      return reconciliation.slice(0, 20).map((item) => ({
        din: item.din,
        description: item.description,
        schedule: item.schedule,
        openingBalance: item.openingBalance,
        purchasedCount: item.purchasedCount,
        dispensedCount: item.dispensedCount,
        actualCount: item.actualCount ?? '—',
        flag: item.flag,
      }));

    case 'prescription':
      return dispensing.slice(0, 20).map((item) => ({
        patientName: item.patientName,
        drugDescription: item.drugDescription,
        drugDIN: item.drugDIN,
        prescriber: item.prescriber,
        quantityPrescribed: item.quantityPrescribed,
        quantityDispensed: item.quantityDispensed,
        status: item.status,
      }));

    case 'schedule':
      return scheduleSlices(inventory).map(({ name, value }) => ({
        schedule: name,
        count: value,
        // Share of the catalogue, so it matches the pie chart beside it.
        percentage: `${((value / inventory.length) * 100).toFixed(1)}%`,
      }));

    default:
      return [];
  }
}

/** Total row count for the report, ignoring the preview's twenty-row cap. */
export function reportRecordCount(type: ReportType, sets: ReportDataSets): number {
  switch (type) {
    case 'inventory':
      return sets.inventory.length;
    case 'dispensing':
    case 'prescription':
      return sets.dispensing.length;
    case 'reconciliation':
      return sets.reconciliation.length;
    case 'schedule':
      // Derived from the same breakdown as the pie chart, which used to be counted twice.
      return countBySchedule(sets.inventory).size;
    default:
      return 0;
  }
}
