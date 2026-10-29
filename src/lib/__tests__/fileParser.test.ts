import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/dinReference', () => ({
  fetchReferenceEntries: async () => undefined,
  getDinReferenceEntry: () => null,
  referenceLabel: () => '',
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { parseSingleFileWithIndividualRows, parseSingleFileWithPreview } from '@/lib/fileParser';

const HEADER = 'Pharmacy,Patient Name,Rx,Qty,Drug Name,DIN,FillDate,Rem Qty,Auth Qty';
const csv = (lines: string[]) => new File([[HEADER, ...lines].join('\r\n') + '\r\n'], `kroll-${Math.random()}.csv`);

describe('Kroll dispensing import', () => {
  it('keeps every prescription, even when drug, quantity and day match', async () => {
    const file = csv([
      'P,"Doe, A",1001,3,TAB Apo-Lorazepam 1mg,00655759,01-Feb-26,0,0',
      'P,"Doe, B",1002,3,TAB Apo-Lorazepam 1mg,00655759,01-Feb-26,0,0',
      'P,"Doe, C",1003,3,TAB Apo-Lorazepam 1mg,00655759,01-Feb-26,0,0',
    ]);
    const { data } = await parseSingleFileWithIndividualRows(file, 'kroll', new Set());
    expect(data).toHaveLength(3);
    expect(data.reduce((n, row) => n + row.quantity, 0)).toBe(9);
  });

  it('drops a prescription that arrives again in a second, overlapping file', async () => {
    const seen = new Set<string>();
    const line = 'P,"Doe, A",1001,3,TAB Apo-Lorazepam 1mg,00655759,01-Feb-26,0,0';
    const first = await parseSingleFileWithIndividualRows(csv([line]), 'kroll', seen);
    const second = await parseSingleFileWithIndividualRows(csv([line]), 'kroll', seen);
    expect(first.data).toHaveLength(1);
    expect(second.data).toHaveLength(0);
  });

  it('keeps all 45 columns in the preview sample but only the needed ones in the rows', async () => {
    const { preview } = await parseSingleFileWithPreview(
      csv(['P,"Doe, A",1001,3,TAB Apo-Lorazepam 1mg,00655759,01-Feb-26,0,0']),
      'kroll'
    );
    expect(preview.detectedColumns).toContain('Patient Name');
    expect(preview.sampleData[0]['Patient Name']).toBe('Doe, A');
    expect(preview.totalRows).toBe(1);
    expect(preview.dateRange?.start).toBeInstanceOf(Date);
  });

  it('aggregates units per DIN', async () => {
    const file = csv([
      'P,"Doe, A",1001,3,TAB Apo-Lorazepam 1mg,00655759,01-Feb-26,0,0',
      'P,"Doe, B",1002,5,TAB Apo-Lorazepam 1mg,00655759,02-Feb-26,0,0',
    ]);
    const { data } = await parseSingleFileWithPreview(file, 'kroll', new Set());
    expect(data.get('00655759')?.dispensed).toBe(8);
  });

  it('reports a file without a DIN column', async () => {
    const file = new File(['Rx,Qty\r\n1,2\r\n'], 'bad.csv');
    await expect(parseSingleFileWithIndividualRows(file, 'kroll')).rejects.toThrow(/DIN column/);
  });
});

describe('very large files', () => {
  it('parses 150,000 rows without overflowing the call stack', async () => {
    const lines: string[] = [];
    for (let i = 0; i < 150_000; i += 1) {
      lines.push(`P,"Doe, ${i}",${2_000_000 + i},${(i % 30) + 1},TAB Apo-Lorazepam 1mg,00655759,${String((i % 28) + 1).padStart(2, '0')}-Feb-26,0,0`);
    }
    const { data, preview } = await parseSingleFileWithIndividualRows(csv(lines), 'kroll', new Set());
    expect(preview.totalRows).toBe(150_000);
    expect(data).toHaveLength(150_000);
  }, 60_000);
});

describe('negative quantities (returns, reversals, corrections)', () => {
  const header = 'Invoice,DIN,Product Name,Qty,Pack Size,Date';
  const purchases = (qtys: number[]) =>
    new File(
      [[header, ...qtys.map((q, i) => `INV${i},00125083,DILAUDID TB 2MG 100,${q},100,2026-03-${String(i + 2).padStart(2, '0')}`)].join('\n') + '\n'],
      `mck-${Math.random()}.csv`
    );

  it('nets a -1 reversal against the purchases of the same drug (16 packs = 1600 units)', async () => {
    const { data } = await parseSingleFileWithPreview(purchases([2, 3, 3, 1, 1, 4, 3, -1]), 'mckesson', new Set());
    expect(data.get('00125083')?.purchased ?? data.get('125083')?.purchased).toBe(1600);
  });

  it('keeps the sign on every individual row', async () => {
    const { data } = await parseSingleFileWithIndividualRows(purchases([3, -1]), 'mckesson', new Set());
    expect(data.map((row) => row.quantity)).toEqual([300, -100]);
  });

  it('reads accounting-style credits as negative, not positive', async () => {
    // Suppliers write a credit with parentheses, a trailing minus or a "CR" suffix; all of
    // them are the same reversal. Reading them as positive added the return to the total.
    const file = new File(
      [
        [
          header,
          'INV1,00125083,DILAUDID TB 2MG 100,3,100,2026-03-02',
          'INV2,00125083,DILAUDID TB 2MG 100,(1),100,2026-03-30',
          'INV3,00125083,DILAUDID TB 2MG 100,1-,100,2026-03-30',
          'INV4,00125083,DILAUDID TB 2MG 100,1 CR,100,2026-03-30',
        ].join('\n') + '\n',
      ],
      `mck-${Math.random()}.csv`
    );

    const { data } = await parseSingleFileWithIndividualRows(file, 'mckesson', new Set());
    expect(data.map((row) => row.quantity)).toEqual([300, -100, -100, -100]);
  });
});
