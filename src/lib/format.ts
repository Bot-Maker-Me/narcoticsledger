/**
 * Formatting helpers for money and plain numbers.
 *
 * `formatPrice` used to live in `types/admin.ts`, which meant a types file exported
 * runtime behaviour. It now sits beside the other display helpers.
 */

/** Cents to a display price: `2900` → `$29.00`. */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Thousands-separated integer, e.g. `1,240`. */
export function formatNumber(value: number): string {
  return value.toLocaleString();
}

/** Bytes to a short human label, e.g. `12.4 KB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
