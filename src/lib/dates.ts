/**
 * Display formatting for dates and numbers — the single source of truth.
 *
 * `formatDate` used to be copy-pasted into two feature `shared.ts` files and
 * `toLocaleDateString(...)` was hand-rolled in twenty more places, so the app showed the
 * same value in half a dozen different formats. Anything that renders a date or a
 * number for the user goes through here.
 *
 * Ledger calendar days are parsed through `parseLedgerDate` (see `lib/ledgerDate.ts`) so
 * a `date` column value never drifts a day backwards for users west of UTC.
 */

import { parseLedgerDate } from '@/lib/ledgerDate';

const SHORT_DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
const LONG_DATE: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };
const DATE_TIME: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

/** `Feb 1, 2026`. Returns `'—'` for a missing or unparseable value. */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString('en-US', SHORT_DATE) : '—';
}

/** `February 1, 2026`. */
export function formatLongDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString('en-US', LONG_DATE) : '—';
}

/** `Feb 1, 2026, 7:00 PM`. */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? date.toLocaleString('en-US', DATE_TIME) : '—';
}

/** `Feb 1` — for compact activity feeds. */
export function formatDayMonth(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
}

/** `February 2026` from a `YYYY-MM` key or any date value. */
export function formatMonthYear(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—';
}

/** `Sunday, February 1` — the header greeting. */
export function formatWeekdayLong(value: string | Date | null | undefined = new Date()): string {
  const date = toDate(value);
  return date
    ? date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';
}

/** The `YYYY-MM-DD` value an `<input type="date">` expects. */
export function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Coerces a value to a `Date`, treating ledger calendar days as local days. */
function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  return parseLedgerDate(value);
}
