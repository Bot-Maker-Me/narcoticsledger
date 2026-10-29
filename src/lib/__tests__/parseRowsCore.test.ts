import { describe, expect, it } from 'vitest';
import { parseRowsCore } from '@/lib/parseRowsCore';

describe('parseRowsCore', () => {
  it('parses a CSV into row objects and skips blank lines', async () => {
    const csv = new File(['DIN,Quantity\n00012345,5\n\n00067890,10\n'], 'purchases.csv', { type: 'text/csv' });
    const rows = await parseRowsCore(csv);
    expect(rows).toEqual([
      { DIN: '00012345', Quantity: '5' },
      { DIN: '00067890', Quantity: '10' },
    ]);
  });

  it('strips Kroll NUL bytes so empty fields stay empty', async () => {
    const csv = new File(['Rx,Qty,DIN,Lot\r\n1,3,00655759,"\0"\r\n'], 'kroll.csv');
    expect(await parseRowsCore(csv)).toEqual([{ Rx: '1', Qty: '3', DIN: '00655759', Lot: '' }]);
  });

  it('decodes a UTF-16 CSV', async () => {
    const text = 'DIN,Qty\r\n00012345,5\r\n';
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i++) bytes[2 + i * 2] = text.charCodeAt(i);
    expect(await parseRowsCore(new File([bytes], 'u16.csv'))).toEqual([{ DIN: '00012345', Qty: '5' }]);
  });

  it('reads the first worksheet of an xlsx workbook', async () => {
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.aoa_to_sheet([
      ['DIN', 'Quantity'],
      ['00012345', 7],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

    const rows = await parseRowsCore(new File([bytes], 'purchases.xlsx'));
    expect(rows).toEqual([{ DIN: '00012345', Quantity: 7 }]);
  });

  it('rejects an unsupported extension', async () => {
    await expect(parseRowsCore(new File(['x'], 'notes.txt'))).rejects.toThrow(/Unsupported/);
  });
});
