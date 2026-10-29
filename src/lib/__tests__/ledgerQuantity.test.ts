import { describe, it, expect } from 'vitest';
import { normalizeQuantity } from '../ledgerQuantity';

describe('normalizeQuantity', () => {
  it('keeps a purchase correction negative instead of taking its absolute value', () => {
    // The regression: a -1 pack reversal was read back as +1, so a month of purchases
    // reported 1800 units instead of 1600 for the DIN in the bug report.
    expect(normalizeQuantity(-100)).toBe(-100);
  });

  it('preserves the sign of ordinary purchases', () => {
    expect(normalizeQuantity(200)).toBe(200);
  });

  it('keeps a negative dispense negative so the reversal subtracts from the total', () => {
    // The second regression: abs()ing a dispense reversal wrote it as another dispensation.
    // The direction of a reduction comes from the transaction type, not from dropping the
    // sign the file reported.
    expect(normalizeQuantity(-200)).toBe(-200);
    expect(normalizeQuantity(-50)).toBe(-50);
  });

  it('coerces missing and non-finite quantities to zero', () => {
    expect(normalizeQuantity(null)).toBe(0);
    expect(normalizeQuantity(undefined)).toBe(0);
    expect(normalizeQuantity(Number.NaN)).toBe(0);
  });

  it('nets a month of purchases including the reversal', () => {
    const march = [2, 3, 3, 1, 1, 4, 3, -1].map((packs) => normalizeQuantity(packs * 100));

    expect(march.reduce((sum, units) => sum + units, 0)).toBe(1600);
  });
});
