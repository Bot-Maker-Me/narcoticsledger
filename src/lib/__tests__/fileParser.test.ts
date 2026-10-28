import { describe, it, expect, vi } from 'vitest';
import { findColumnKey, DATE_COLUMNS } from '../fileParser';

// fileParser pulls in the Supabase client, which needs env vars; the tests don't use it.
vi.mock('../supabase', () => ({ supabase: {} }));

/** The heading row of a real Kroll dispensing export ("Disp Kroll … .csv"). */
const KROLL_HEADINGS = [
  'Pharmacy',
  'Patient Name',
  'Pat Address1',
  'Pat Address2',
  'Pat City/Prov',
  'Pat Phone #',
  'Pat Postal',
  'Family Doctor',
  'Nursing Home',
  'Ward',
  'Rx',
  'Qty',
  'Drug Name',
  'DIN',
  'Sig Code',
  'First FillDate',
  'FillDate',
  'Status',
  'Lot Numbers',
  'Rem Qty',
  'Auth Qty',
  'AAC',
  'Cost',
  'Eff. Markup',
  'Markup %',
  'Fees',
  'Total',
  'G.P. %',
  'Co-pay',
  'Doctor',
  'Doc Address',
  'Doc City',
  'Doc Prov',
  'Doc Postal',
  'Doc License',
  'Doc Phone #',
  '',
  'SSCFee',
  'Pack size',
  'UPC',
  'Orig Rx',
  'Workflow Status',
  'Room',
  'Bed',
  'Quick Code',
];

describe('findColumnKey', () => {
  // Regression: "First FillDate" contains "Date", so the loose substring match filed
  // every dispensation under the day the prescription was first written (e.g. 27-Jan-26)
  // instead of the day it was actually filled (01-Feb-26).
  it('uses the fill date, not the first-fill date, on a Kroll dispensing export', () => {
    expect(findColumnKey(KROLL_HEADINGS, DATE_COLUMNS)).toBe('FillDate');
  });

  it('uses the dispensed quantity and not a remaining / authorized quantity', () => {
    expect(findColumnKey(KROLL_HEADINGS, ['Quantity', 'Qty', 'Dispensed'])).toBe('Qty');
  });

  it('prefers an exact heading over one that merely contains it', () => {
    expect(findColumnKey(['Qty', 'Quantity'], ['Quantity', 'Qty'])).toBe('Quantity');
  });

  it('still falls back to a partial heading', () => {
    expect(findColumnKey(['First FillDate'], DATE_COLUMNS)).toBe('First FillDate');
    expect(findColumnKey(['Product DIN'], ['DIN'])).toBe('Product DIN');
  });

  it('returns null when no heading matches', () => {
    expect(findColumnKey(KROLL_HEADINGS, ['Nothing Like This'])).toBeNull();
  });
});
