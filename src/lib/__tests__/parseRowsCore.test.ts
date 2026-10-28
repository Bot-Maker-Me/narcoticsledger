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
