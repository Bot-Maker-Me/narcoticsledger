/**
 * Sign handling for imported ledger quantities.
 *
 * The ledger stores the *signed* quantity the file reported for a purchase, so a return,
 * reversal or invoice correction (a negative quantity) reduces that DIN's totals instead
 * of adding to them. Reductions (dispense, destruction) are stored negative and their
 * direction comes from the transaction type, so they are read back as a positive
 * magnitude — the sign must not leak into "units dispensed".
 *
 * This is audit-relevant: the monthly DIN totals are built from these values, so a stray
 * `abs()` here makes a month of corrections report the wrong total.
 */

/** The kinds of records a supplier file can be imported as. */
export type ImportKind = 'purchase' | 'dispense' | 'destruction';

/**
 * Normalises a raw or stored quantity for one record kind.
 *
 * - `purchase` keeps its sign, so negative corrections reduce totals.
 * - `dispense` / `destruction` are returned as a positive magnitude.
 */
export function normalizeQuantity(
  kind: ImportKind,
  quantity: number | null | undefined
): number {
  const value = Number(quantity ?? 0);
  if (!Number.isFinite(value)) return 0;
  return kind === 'purchase' ? value : Math.abs(value);
}
