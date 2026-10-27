import { describe, it, expect } from 'vitest';
import {
  parseLedgerDate,
  ledgerMonthKey,
  toLedgerDateString,
  formatLedgerDate,
} from '../ledgerDate';

describe('parseLedgerDate', () => {
  it('reads a date column value as a local calendar day, not UTC midnight', () => {
    const date = parseLedgerDate('2026-02-01');

    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
    expect(date!.getMonth()).toBe(1);
    expect(date!.getDate()).toBe(1);
  });

  // Regression: `new Date('2026-02-01')` is UTC midnight, which showed up as
  // "1/31/2026, 7:00:00 PM" for users west of UTC and counted in the wrong month.
  it('round-trips a calendar day without drifting', () => {
    expect(toLedgerDateString(parseLedgerDate('2026-02-01')!)).toBe('2026-02-01');
    expect(toLedgerDateString(parseLedgerDate('2026-01-01')!)).toBe('2026-01-01');
    expect(toLedgerDateString(parseLedgerDate('2026-12-31')!)).toBe('2026-12-31');
  });

  it('still accepts real timestamps', () => {
    const date = parseLedgerDate('2026-02-01T12:30:00.000Z');
    expect(date).toBeInstanceOf(Date);
    expect(Number.isNaN(date!.getTime())).toBe(false);
  });

  it('returns null for missing or unparseable values', () => {
    expect(parseLedgerDate(null)).toBeNull();
    expect(parseLedgerDate(undefined)).toBeNull();
    expect(parseLedgerDate('')).toBeNull();
    expect(parseLedgerDate('not a date')).toBeNull();
  });
});

describe('ledgerMonthKey', () => {
  it('keys by the calendar month', () => {
    expect(ledgerMonthKey('2026-02-01')).toBe('2026-02');
    expect(ledgerMonthKey('2026-02-28')).toBe('2026-02');
    expect(ledgerMonthKey('2026-12-01')).toBe('2026-12');
  });

  it('is empty for a missing value', () => {
    expect(ledgerMonthKey(undefined)).toBe('');
    expect(ledgerMonthKey('nonsense')).toBe('');
  });
});

describe('toLedgerDateString', () => {
  it('formats a local Date as YYYY-MM-DD with zero padding', () => {
    expect(toLedgerDateString(new Date(2026, 1, 1))).toBe('2026-02-01');
    expect(toLedgerDateString(new Date(2026, 11, 31))).toBe('2026-12-31');
    expect(toLedgerDateString(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});

describe('formatLedgerDate', () => {
  it('shows a calendar day on its own', () => {
    expect(formatLedgerDate('2026-02-01')).toBe('Feb 1, 2026');
  });

  it('shows a dash for a missing value', () => {
    expect(formatLedgerDate(null)).toBe('—');
    expect(formatLedgerDate(undefined)).toBe('—');
  });
});
