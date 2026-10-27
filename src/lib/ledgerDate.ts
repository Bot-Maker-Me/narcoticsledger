/**
 * Ledger dates are calendar days, not moments in time.
 *
 * The `inventory_transactions.date` column is a Postgres `date`, so the API hands it
 * back as a plain "YYYY-MM-DD" string. `new Date('2026-02-01')` parses that as UTC
 * midnight, which shifts the day (and sometimes the month) backwards for anyone west of
 * UTC: a February 1 purchase was displayed as "1/31/2026, 7:00:00 PM" and counted in
 * January. These helpers keep the calendar day intact.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a ledger value, treating "YYYY-MM-DD" as a local calendar day. */
export function parseLedgerDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  const match = DATE_ONLY.exec(trimmed);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "YYYY-MM" key of the calendar month a ledger date falls in. */
export function ledgerMonthKey(value: string | null | undefined): string {
  const date = parseLedgerDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * "YYYY-MM-DD" for a Date in local time — the value the `date` column stores, so a
 * calendar day never drifts when the row is written.
 */
export function toLedgerDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Displays a ledger date. Calendar days ("YYYY-MM-DD") are shown as a day only;
 * real timestamps (manual entries) also include the time.
 */
export function formatLedgerDate(value: string | null | undefined): string {
  const date = parseLedgerDate(value);
  if (!date) return '—';

  if (DATE_ONLY.test(String(value).trim())) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
