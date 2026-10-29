import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, uploadKindOf, validateUpload, validateUploads } from '@/lib/uploadValidation';

const file = (name: string, bytes: number[] | string, type = '') =>
  new File([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], name, { type });

/** A Kroll dispensing row: every empty column is written as a NUL placeholder. */
const krollCsv =
  'Pharmacy,Qty,DIN,Drug Name,Lot Numbers,Workflow Status\n' +
  '3753,3,00655759,TAB Apo-Lorazepam 1mg,"\u0000","\u0000"\n' +
  '3753,1,00405337,TAB Diazepam 10mg,"\u0000","\u0000"\n';

describe('uploadKindOf', () => {
  it('maps supported extensions case-insensitively and rejects the rest', () => {
    expect(uploadKindOf('a.CSV')).toBe('csv');
    expect(uploadKindOf('a.b.xlsx')).toBe('xlsx');
    expect(uploadKindOf('a.xls')).toBe('xls');
    expect(uploadKindOf('a.exe')).toBeNull();
    expect(uploadKindOf('noextension')).toBeNull();
  });
});

describe('validateUpload', () => {
  it('accepts a text CSV, with or without a reported MIME type', async () => {
    expect((await validateUpload(file('a.csv', 'DIN,Qty\n1,2'))).ok).toBe(true);
    expect((await validateUpload(file('a.csv', 'DIN,Qty\n1,2', 'text/csv'))).ok).toBe(true);
  });

  // Regression: the extension is the gate. Windows reports a .csv as
  // "application/vnd.ms-excel", some browsers report nothing, and a claim about the type
  // must never be the reason a real export is refused.
  it('accepts .csv / .xlsx / .xls whatever MIME type the browser reports', async () => {
    const types = [
      '',
      'text/csv',
      'text/plain',
      'application/vnd.ms-excel',
      'application/octet-stream',
      'application/x-msdownload',
    ];
    for (const type of types) {
      expect((await validateUpload(file('a.csv', 'DIN,Qty\n1,2', type))).ok).toBe(true);
    }

    const zip = [0x50, 0x4b, 0x03, 0x04, 0, 0];
    const ole2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    expect((await validateUpload(file('a.xlsx', zip, 'application/octet-stream'))).ok).toBe(true);
    expect((await validateUpload(file('a.xls', ole2, 'application/vnd.ms-excel'))).ok).toBe(true);
  });

  // Regression: Kroll pads every empty column of its dispensing exports with a NUL
  // placeholder ("\u0000", about four per row), so the old "a text export never contains a
  // NUL byte" test rejected a genuine 40,000-row dispensing file as "not a text CSV file".
  it('accepts a real Kroll export that pads empty columns with NUL placeholders', async () => {
    const result = await validateUpload(
      file('Disp Kroll 2026-02-01 to 2026-03-31.csv', krollCsv, 'application/vnd.ms-excel')
    );
    expect(result).toEqual({ ok: true, kind: 'csv' });
  });

  it('accepts a CSV of NUL / control bytes, which the parser strips', async () => {
    expect((await validateUpload(file('a.csv', [0x00, 0x01, 0x02, 0x03]))).ok).toBe(true);
  });

  it('rejects a renamed file whose bytes do not match its extension', async () => {
    const fakeXlsx = await validateUpload(file('a.xlsx', '<html>not a workbook</html>'));
    expect(fakeXlsx.ok).toBe(false);

    const fakeCsv = await validateUpload(file('a.csv', [0x4d, 0x5a, 0x90, 0x00, 0x03]));
    expect(fakeCsv.ok).toBe(false);

    const mostlyNul = await validateUpload(file('b.csv', new Array(64).fill(0)));
    expect(mostlyNul.ok).toBe(false);
  });

  it('accepts a Kroll-style CSV with stray NUL bytes in quoted empty fields', async () => {
    const kroll = 'Rx,Qty,DIN,Lot\r\n1,3,00655759,"\0"\r\n2,4,00771313,"\0"\r\n';
    expect((await validateUpload(file('Disp Kroll.csv', kroll, 'application/vnd.ms-excel'))).ok).toBe(true);
  });

  it('accepts a UTF-16 CSV with a byte-order mark', async () => {
    expect((await validateUpload(file('a.csv', [0xff, 0xfe, 0x44, 0, 0x49, 0, 0x4e, 0, 0x0a, 0]))).ok).toBe(true);
  });

  it('rejects empty files and unsupported extensions', async () => {
    expect((await validateUpload(file('a.csv', ''))).ok).toBe(false);
    expect((await validateUpload(file('a.exe', 'x'))).ok).toBe(false);
  });

  it('rejects files over the size limit without reading them', async () => {
    const big = file('a.csv', 'x');
    Object.defineProperty(big, 'size', { value: MAX_UPLOAD_BYTES + 1 });
    const result = await validateUpload(big);
    expect(result.ok).toBe(false);
  });
});

describe('validateUploads', () => {
  it('splits accepted and rejected files, keeping order', async () => {
    const good = file('ok.csv', 'DIN\n1');
    const bad = file('bad.xlsx', 'nope');
    const { accepted, rejected } = await validateUploads([bad, good]);
    expect(accepted).toEqual([good]);
    expect(rejected.map((entry) => entry.file)).toEqual([bad]);
  });
});
