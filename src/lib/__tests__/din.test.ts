import { describe, it, expect } from 'vitest';
import {
  digitsOf,
  normalizeDin,
  padDin,
  dinCandidates,
  isSameDin,
  looksLikeDin,
  isValidDin,
} from '../din';

describe('digitsOf', () => {
  it('strips every separator from a DIN', () => {
    expect(digitsOf('0226-6687')).toBe('02266687');
    expect(digitsOf(' 0226 6687 ')).toBe('02266687');
  });

  it('tolerates numbers and empty values', () => {
    expect(digitsOf(123456)).toBe('123456');
    expect(digitsOf(null)).toBe('');
    expect(digitsOf(undefined)).toBe('');
    expect(digitsOf('DIN: n/a')).toBe('');
  });
});

describe('normalizeDin / padDin', () => {
  it('pads a short DIN back to eight digits', () => {
    expect(normalizeDin('2266687')).toBe('02266687');
    expect(normalizeDin('6687')).toBe('00006687');
  });

  it('leaves longer identifiers alone', () => {
    expect(normalizeDin('1234567890')).toBe('1234567890');
  });

  it('returns null (and empty string) when there is nothing to pad', () => {
    expect(normalizeDin('   ')).toBeNull();
    expect(padDin('abc')).toBe('');
  });
});

describe('dinCandidates', () => {
  it('offers the raw value, zero-padded forms and the leading-zero-trimmed value', () => {
    const candidates = dinCandidates('066687');

    expect(candidates).toContain('066687');
    expect(candidates).toContain('0066687');
    expect(candidates).toContain('00066687');
    expect(candidates).toContain('66687');
  });

  it('is empty when there are no digits', () => {
    expect(dinCandidates('')).toEqual([]);
  });
});

describe('isSameDin', () => {
  it('ignores separators and leading zeros', () => {
    expect(isSameDin('0226-6687', '2266687')).toBe(true);
    expect(isSameDin('02266687', '02266687')).toBe(true);
  });

  it('never matches an empty value', () => {
    expect(isSameDin('', '')).toBe(false);
    expect(isSameDin(null, '123456')).toBe(false);
  });

  it('does not match different DINs', () => {
    expect(isSameDin('02266687', '02266688')).toBe(false);
  });
});

describe('looksLikeDin / isValidDin', () => {
  it('treats six or more digits as a DIN rather than a quantity', () => {
    expect(looksLikeDin('123456')).toBe(true);
    expect(looksLikeDin('12345')).toBe(false);
  });

  it('accepts six to ten digits as a valid DIN', () => {
    expect(isValidDin('02266687')).toBe(true);
    expect(isValidDin('2266687')).toBe(true);
    expect(isValidDin('12345')).toBe(false);
    expect(isValidDin('12345678901')).toBe(false);
    expect(isValidDin('')).toBe(false);
  });
});
