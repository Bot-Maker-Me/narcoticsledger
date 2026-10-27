import type { ReconciliationItemDraft } from '@/types/reconciliation';
import { formatDate } from '@/lib/dates';

const HEADERS = [
  'DIN',
  'Description',
  'Opening Balance',
  'Purchased',
  'Dispensed',
  'Expected',
  'Actual',
  'Variance',
  'Flag',
];

/** Rows shared by the CSV and PDF exports, so the two can never drift apart. */
function toRows(items: ReconciliationItemDraft[]): string[][] {
  return items.map((item) => {
    const expected = item.opening_balance + item.purchased_count - item.dispensed_count;
    const variance = item.actual_count !== null ? item.actual_count - expected : null;

    return [
      item.din,
      item.description ?? '',
      String(item.opening_balance),
      String(item.purchased_count),
      String(item.dispensed_count),
      String(expected),
      item.actual_count !== null ? String(item.actual_count) : '',
      variance !== null ? String(variance) : '',
      item.flag,
    ];
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function exportToCSV(items: ReconciliationItemDraft[], filename = 'reconciliation.csv') {
  const escape = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
  const lines = [HEADERS.join(','), ...toRows(items).map((row) => row.map(escape).join(','))];

  downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), filename);
}

/**
 * Renders the reconciliation table as a PDF.
 *
 * `jspdf` is imported on demand — it is a large dependency that most sessions never
 * touch, so it stays out of the initial bundle.
 */
export async function exportToPDF(items: ReconciliationItemDraft[], filename = 'reconciliation.pdf') {
  const { default: jsPDF } = await import('jspdf');

  const doc = new jsPDF();
  const columnWidths = [20, 45, 15, 15, 15, 15, 15, 15, 15];
  const rowHeight = 7;

  const xForColumn = (index: number) => 14 + columnWidths.slice(0, index).reduce((sum, width) => sum + width, 0);

  doc.setFontSize(18);
  doc.text('Reconciliation Report', 14, 22);

  doc.setFontSize(10);
  doc.text(`Generated: ${formatDate(new Date())}`, 14, 30);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  HEADERS.forEach((header, index) => doc.text(header, xForColumn(index), 40));
  doc.line(14, 47, 196, 47);

  doc.setFont('helvetica', 'normal');
  let y = 52;

  for (const row of toRows(items)) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    row.forEach((cell, index) => {
      const text = index === 1 ? `${cell.substring(0, 30)}${cell.length > 30 ? '...' : ''}` : cell;
      doc.text(text, xForColumn(index), y);
    });
    y += rowHeight;
  }

  if (y > 240) {
    doc.addPage();
    y = 20;
  }

  const counts = { OK: 0, Review: 0, Verify: 0, counted: 0 };
  for (const item of items) {
    if (item.actual_count !== null) counts.counted += 1;
    if (item.flag === 'OK' || item.flag === 'Review' || item.flag === 'Verify') counts[item.flag] += 1;
  }

  y += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', 14, y);

  doc.setFont('helvetica', 'normal');
  const summary = [
    `Total Items: ${items.length}`,
    `Counted: ${counts.counted}`,
    `OK: ${counts.OK}`,
    `Review: ${counts.Review}`,
    `Verify: ${counts.Verify}`,
  ];
  summary.forEach((line, index) => doc.text(line, 14, y + 7 + index * 5));

  doc.save(filename);
}
