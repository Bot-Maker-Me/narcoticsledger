/**
 * Sign handling for imported ledger quantities.
 *
 * The ledger keeps the sign the file reported: a return, reversal or invoice correction
 * arrives as a negative quantity, and that sign has to survive so the reversal *reduces* the
 * totals instead of being counted as one more movement. `import_ledger_rows` applies the
 * direction of the import kind on top of this sign, so a negative purchase row takes stock
 * away and a negative dispense row gives the units back.
 *
 * This is audit-relevant: the monthly DIN totals are built from these values, so a stray
 * `abs()` here makes a month of corrections report the wrong total.
 */

/** The kinds of records a supplier file can be imported as. */
export type ImportKind = 'purchase' | 'dispense' | 'destruction';

/**
 * Coerces a quantity reported by a file (or read back from the ledger) to a finite number,
 * keeping the sign it was reported with.
 *
 * Missing, unusable and zero values become `0`, which the save path treats as "nothing to
 * write".
 */
export function normalizeQuantity(quantity: number | null | undefined): number {
  const value = Number(quantity ?? 0);
  return Number.isFinite(value) ? value : 0;
}
