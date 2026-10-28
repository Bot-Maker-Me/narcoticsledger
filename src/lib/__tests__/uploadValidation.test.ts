import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, uploadKindOf, validateUpload, validateUploads } from '@/lib/uploadValidation';

const file = (name: string, bytes: number[] | string, type = '') =>
  new File([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], name, { type });

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

  it('accepts real xlsx / xls signatures', async () => {
    expect((await validateUpload(file('a.xlsx', [0x50, 0x4b, 0x03, 0x04, 0, 0]))).ok).toBe(true);
    expect((await validateUpload(file('a.xls', [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).ok).toBe(true);
  });

  it('rejects a renamed file whose bytes do not match its extension', async () => {
    const fakeXlsx = await validateUpload(file('a.xlsx', '<html>not a workbook</html>'));
    expect(fakeXlsx.ok).toBe(false);

    const fakeCsv = await validateUpload(file('a.csv', [0x4d, 0x5a, 0x90, 0x00, 0x03]));
    expect(fakeCsv.ok).toBe(false);
  });

  it('rejects empty files, wrong MIME types and unsupported extensions', async () => {
    expect((await validateUpload(file('a.csv', ''))).ok).toBe(false);
    expect((await validateUpload(file('a.csv', 'x,y', 'application/x-msdownload'))).ok).toBe(false);
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
