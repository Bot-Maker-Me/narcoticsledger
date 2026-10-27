import { describe, it, expect, vi } from 'vitest';
import { generateRowSignature } from '../fileParser';

// fileParser pulls in the Supabase client, which needs env vars; the tests don't use it.
vi.mock('../supabase', () => ({ supabase: {} }));

const DIN = '02143933';
const row = (invoice: number, product: number, desc: string) => ({
  'Invoice #': invoice,
  'Product(s) #': product,
  Description: desc,
});
const d = (s: string) => new Date(s);

describe('generateRowSignature', () => {
  // Regression: two products sharing a DIN on one invoice with the same quantity
  // (100-pack vs 200-pack) were treated as duplicates, so units went missing.
  it('keeps different products on the same invoice, DIN, date and quantity', () => {
    const a = generateRowSignature(DIN, 48, d('2026-02-02'), row(351319, 157710, 'SIV ACET W/CD 300/15/8MG 200'));
    const b = generateRowSignature(DIN, 48, d('2026-02-02'), row(351319, 157722, 'SIV ACET W/CD 300/15/8MG 100'));
    expect(a).not.toEqual(b);
  });

  it('keeps different pack sizes even if the product number column is missing', () => {
    const a = generateRowSignature(DIN, 24, d('2026-02-23'), { 'Invoice #': 568497, Description: 'SIV ACET W/CD 300/15/8MG 200' });
    const b = generateRowSignature(DIN, 24, d('2026-02-23'), { 'Invoice #': 568497, Description: 'SIV ACET W/CD 300/15/8MG 100' });
    expect(a).not.toEqual(b);
  });

  it('still treats a true repeat (same invoice, product, qty, date) as a duplicate', () => {
    const a = generateRowSignature(DIN, 48, d('2026-02-02'), row(351319, 157722, 'SIV ACET W/CD 300/15/8MG 100'));
    const b = generateRowSignature(DIN, 48, d('2026-02-02'), row(351319, 157722, 'SIV ACET W/CD 300/15/8MG 100'));
    expect(a).toEqual(b);
  });
});
