import { describe, expect, it } from 'vitest';
import { parseRowsCore } from '@/lib/parseRowsCore';

/** A Kroll dispensing row: every empty column is written as a NUL placeholder. */
const krollCsv =
  'Pharmacy,Qty,DIN,Drug Name,Lot Numbers,Workflow Status\n' +
  '3753,3,00655759,TAB Apo-Lorazepam 1mg,"\u0000","\u0000"\n' +
  '3753,1,00405337,TAB Diazepam 10mg,"\u0000","\u0000"\n';

const bytesOf = (text: string) => [...text].map((char) => char.charCodeAt(0));

describe('parseRowsCore', () => {
  it('parses a CSV into row objects and skips blank lines', async () => {
    const csv = new File(['DIN,Quantity\n00012345,5\n\n00067890,10\n'], 'purchases.csv', { type: 'text/csv' });
    const rows = await parseRowsCore(csv);
    expect(rows).toEqual([
      { DIN: '00012345', Quantity: '5' },
      { DIN: '00067890', Quantity: '10' },
    ]);
  });

  // Regression: NUL placeholders are what makes a real Kroll export look "binary". They are
  // stripped before parsing, so the empty columns come through as empty strings.
  it('strips the NUL placeholders out of a supplier export', async () => {
    const rows = await parseRowsCore(new File([krollCsv], 'Disp Kroll 2026-02-01 to 2026-03-31.csv'));
    expect(rows).toEqual([
      {
        Pharmacy: '3753',
        Qty: '3',
        DIN: '00655759',
        'Drug Name': 'TAB Apo-Lorazepam 1mg',
        'Lot Numbers': '',
        'Workflow Status': '',
      },
      {
        Pharmacy: '3753',
        Qty: '1',
        DIN: '00405337',
        'Drug Name': 'TAB Diazepam 10mg',
        'Lot Numbers': '',
        'Workflow Status': '',
      },
    ]);
  });

  it('decodes a UTF-16 export from its byte order mark', async () => {
    const utf16 = 'DIN,Qty\n00012345,5\n';
    const bytes: number[] = [0xff, 0xfe];
    for (const char of utf16) {
      const code = char.charCodeAt(0);
      bytes.push(code & 0xff, code >> 8);
    }

    const rows = await parseRowsCore(new File([new Uint8Array(bytes)], 'utf16.csv'));
    expect(rows).toEqual([{ DIN: '00012345', Qty: '5' }]);
  });

  it('decodes a legacy Windows-1252 export instead of mangling it', async () => {
    // 0xE9 is "é" in Windows-1252, and on its own it is not valid UTF-8.
    const bytes = new Uint8Array([
      ...bytesOf('DIN,Drug Name\n00012345,Diaz'),
      0xe9,
      ...bytesOf('pam 10mg\n'),
    ]);

    const rows = await parseRowsCore(new File([bytes], 'legacy.csv'));
    const accented = `Diaz${String.fromCharCode(0xe9)}pam 10mg`;
    expect(rows).toEqual([{ DIN: '00012345', 'Drug Name': accented }]);
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
