import { describe, it, expect } from 'vitest';
import {
  SCHEDULE_COLORS,
  countBySchedule,
  rangeStart,
  reportHeaders,
  reportRecordCount,
  reportRows,
  scheduleSlices,
  withinRange,
  type DispensingReportRow,
  type InventoryReportRow,
  type ReconciliationReportRow,
  type ReportDataSets,
} from '../reports';

const inventoryRow = (
  din: string,
  schedule: InventoryReportRow['schedule']
): InventoryReportRow => ({
  din,
  description: `Drug ${din}`,
  schedule,
  currentStock: 10,
  reorderLevel: 2,
  packSize: 1,
});

const dispensingRow = (createdAt: string): DispensingReportRow => ({
  patientName: 'A Patient',
  drugDescription: 'HYDROMORPHONE 2MG',
  drugDIN: '02266687',
  quantityPrescribed: 30,
  quantityDispensed: 30,
  prescriber: 'Dr. Nguyen',
  status: 'completed',
  createdAt,
});

const reconciliationRow = (actualCount: number | null): ReconciliationReportRow => ({
  din: '02266687',
  description: 'HYDROMORPHONE 2MG',
  schedule: 'Narcotic',
  openingBalance: 10,
  purchasedCount: 5,
  dispensedCount: 3,
  actualCount,
  flag: actualCount === null ? 'Pending count' : 'OK',
  cycleDate: '2026-02-01T12:00:00.000Z',
});

const sets = (patch: Partial<ReportDataSets> = {}): ReportDataSets => ({
  inventory: [],
  dispensing: [],
  reconciliation: [],
  ...patch,
});

const manyInventory = (count: number): InventoryReportRow[] =>
  Array.from({ length: count }, (_, index) => inventoryRow(`din-${index}`, 'Narcotic'));

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

describe('countBySchedule / scheduleSlices', () => {
  it('counts each schedule and omits empty ones', () => {
    const counts = countBySchedule([
      inventoryRow('1', 'Narcotic'),
      inventoryRow('2', 'Narcotic'),
      inventoryRow('3', 'Targeted'),
    ]);

    expect(counts.get('Narcotic')).toBe(2);
    expect(counts.get('Targeted')).toBe(1);
    expect(counts.has('Controlled')).toBe(false);
  });

  it('assigns chart colours cyclically without repeating the palette first', () => {
    const slices = scheduleSlices([
      inventoryRow('1', 'Narcotic'),
      inventoryRow('2', 'Controlled'),
      inventoryRow('3', 'Targeted'),
      inventoryRow('4', 'Verify'),
    ]);

    expect(slices).toHaveLength(4);
    expect(slices.map((slice) => slice.color)).toEqual([...SCHEDULE_COLORS]);
  });

  it('is empty for an empty catalogue', () => {
    expect(scheduleSlices([])).toEqual([]);
    expect(countBySchedule([]).size).toBe(0);
  });
});

describe('reportHeaders', () => {
  /**
   * The preview table and the CSV must describe the same columns the rows are shaped for.
   * `dispensing` once said "Patient" while the row carried `patientName` under "Patient Name".
   */
  it('names every column the preview shows', () => {
    expect(reportHeaders('inventory')).toEqual([
      'DIN',
      'Description',
      'Schedule',
      'Current Stock',
      'Reorder Level',
      'Pack Size',
    ]);
    expect(reportHeaders('dispensing')).toEqual([
      'Patient Name',
      'Drug',
      'DIN',
      'Prescribed',
      'Dispensed',
      'Status',
      'Date',
    ]);
    expect(reportHeaders('reconciliation')).toEqual([
      'DIN',
      'Description',
      'Schedule',
      'Opening',
      'Purchased',
      'Dispensed',
      'Actual',
      'Flag',
    ]);
    expect(reportHeaders('schedule')).toEqual(['Schedule', 'Count', 'Percentage']);
  });
});

describe('reportRows', () => {
  it('caps the on-screen preview at twenty rows', () => {
    expect(reportRows('inventory', sets({ inventory: manyInventory(25) }))).toHaveLength(20);
  });

  it('renders a missing actual count as a dash', () => {
    const rows = reportRows('reconciliation', sets({ reconciliation: [reconciliationRow(null)] }));
    expect(rows[0].actualCount).toBe('—');

    const counted = reportRows('reconciliation', sets({ reconciliation: [reconciliationRow(12)] }));
    expect(counted[0].actualCount).toBe(12);
  });

  it('formats the dispensing date for display', () => {
    const rows = reportRows('dispensing', sets({ dispensing: [dispensingRow('2026-02-01')] }));
    expect(rows[0].createdAt).toBe(new Date('2026-02-01').toLocaleDateString());
  });

  it('makes the schedule rows add up to the whole catalogue', () => {
    const inventory = [
      inventoryRow('1', 'Narcotic'),
      inventoryRow('2', 'Narcotic'),
      inventoryRow('3', 'Controlled'),
      inventoryRow('4', 'Targeted'),
    ];

    expect(reportRows('schedule', sets({ inventory }))).toEqual([
      { schedule: 'Narcotic', count: 2, percentage: '50.0%' },
      { schedule: 'Controlled', count: 1, percentage: '25.0%' },
      { schedule: 'Targeted', count: 1, percentage: '25.0%' },
    ]);
  });
});

describe('reportRecordCount', () => {
  it('counts the whole data set, not the twenty-row preview', () => {
    expect(reportRecordCount('inventory', sets({ inventory: manyInventory(25) }))).toBe(25);
  });

  it('counts each report from the set it actually shows', () => {
    const data = sets({
      inventory: manyInventory(4),
      dispensing: [dispensingRow('2026-02-01'), dispensingRow('2026-02-02')],
      reconciliation: [reconciliationRow(null)],
    });

    expect(reportRecordCount('dispensing', data)).toBe(2);
    expect(reportRecordCount('prescription', data)).toBe(2);
    expect(reportRecordCount('reconciliation', data)).toBe(1);
  });

  // Regression: the schedule count was a second, separate reduce that could drift from the
  // pie chart beside it. It now comes from the same breakdown.
  it('reports one row per schedule', () => {
    const inventory = [
      inventoryRow('1', 'Narcotic'),
      inventoryRow('2', 'Narcotic'),
      inventoryRow('3', 'Targeted'),
    ];

    expect(reportRecordCount('schedule', sets({ inventory }))).toBe(scheduleSlices(inventory).length);
    expect(reportRecordCount('schedule', sets({ inventory }))).toBe(2);
  });
});

describe('rangeStart / withinRange', () => {
  it('is unbounded for "all time"', () => {
    expect(rangeStart('all')).toBeNull();
    expect(withinRange(undefined, null)).toBe(true);
    expect(withinRange('2020-01-01T00:00:00.000Z', null)).toBe(true);
  });

  it('windows the dated reports', () => {
    const sevenDays = rangeStart('7d')!;

    expect(withinRange(daysAgo(1), sevenDays)).toBe(true);
    expect(withinRange(daysAgo(30), sevenDays)).toBe(false);
  });

  it('widens as the range widens', () => {
    expect(rangeStart('90d')!.getTime()).toBeLessThan(rangeStart('30d')!.getTime());
    expect(rangeStart('30d')!.getTime()).toBeLessThan(rangeStart('7d')!.getTime());
  });

  it('excludes undated rows once a window is set', () => {
    const window = rangeStart('30d');

    expect(withinRange(null, window)).toBe(false);
    expect(withinRange(undefined, window)).toBe(false);
    expect(withinRange('not a date', window)).toBe(false);
  });
});
