import jsPDF from 'jspdf';
import type { ReconciliationItemDraft } from '@/types/reconciliation';

export function exportToCSV(items: ReconciliationItemDraft[], filename: string = 'reconciliation.csv') {
  const headers = ['DIN', 'Description', 'Opening Balance', 'Purchased', 'Dispensed', 'Expected', 'Actual', 'Variance', 'Flag'];
  
  const rows = items.map(item => {
    const expected = item.opening_balance + item.purchased_count - item.dispensed_count;
    const variance = item.actual_count !== null ? item.actual_count - expected : null;
    
    return [
      item.din,
      `"${item.description}"`,
      item.opening_balance,
      item.purchased_count,
      item.dispensed_count,
      expected,
      item.actual_count ?? '',
      variance !== null ? variance : '',
      item.flag
    ].join(',');
  });
  
  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if ((navigator as any).msSaveBlob) {
    (navigator as any).msSaveBlob(blob, filename);
  } else {
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}

export function exportToPDF(items: ReconciliationItemDraft[], filename: string = 'reconciliation.pdf') {
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(18);
  doc.text('Reconciliation Report', 14, 22);
  
  // Date
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);
  
  // Table headers
  const headers = ['DIN', 'Description', 'Opening', 'Purchased', 'Dispensed', 'Expected', 'Actual', 'Variance', 'Flag'];
  const colWidths = [20, 45, 15, 15, 15, 15, 15, 15, 15];
  
  let y = 40;
  
  // Draw headers
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  headers.forEach((header, i) => {
    let x = 14;
    for (let j = 0; j < i; j++) {
      x += colWidths[j];
    }
    doc.text(header, x, y);
  });
  
  y += 7;
  
  // Draw line under headers
  doc.line(14, y, 196, y);
  y += 5;
  
  // Draw data rows
  doc.setFont(undefined, 'normal');
  items.forEach((item, index) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    
    const expected = item.opening_balance + item.purchased_count - item.dispensed_count;
    const variance = item.actual_count !== null ? item.actual_count - expected : null;
    
    const row = [
      item.din,
      (item.description || 'Unknown').substring(0, 30) + (item.description && item.description.length > 30 ? '...' : ''),
      item.opening_balance.toString(),
      item.purchased_count.toString(),
      item.dispensed_count.toString(),
      expected.toString(),
      (item.actual_count?.toString() || ''),
      variance !== null ? variance.toString() : '',
      item.flag
    ];
    
    row.forEach((cell, i) => {
      let x = 14;
      for (let j = 0; j < i; j++) {
        x += colWidths[j];
      }
      doc.text(cell, x, y);
    });
    
    y += 7;
  });
  
  // Summary
  const counted = items.filter(i => i.actual_count !== null).length;
  const ok = items.filter(i => i.flag === 'OK').length;
  const review = items.filter(i => i.flag === 'Review').length;
  const verify = items.filter(i => i.flag === 'Verify').length;
  
  if (y > 240) {
    doc.addPage();
    y = 20;
  }
  
  y += 10;
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('Summary', 14, y);
  y += 7;
  
  doc.setFont(undefined, 'normal');
  doc.text(`Total Items: ${items.length}`, 14, y);
  y += 5;
  doc.text(`Counted: ${counted}`, 14, y);
  y += 5;
  doc.text(`OK: ${ok}`, 14, y);
  y += 5;
  doc.text(`Review: ${review}`, 14, y);
  y += 5;
  doc.text(`Verify: ${verify}`, 14, y);
  
  doc.save(filename);
}