/**
 * DIN (Drug Identification Number) helpers — the single source of truth.
 *
 * Every layer used to re-implement "strip the separators, pad to eight digits" on its
 * own (the parser, the import hooks, the reconciliation page, the modals, the record
 * browsers). They are all funnelled through this module so a DIN is normalised exactly
 * one way across the app.
 *
 * Supplier exports routinely drop the leading zeros of an eight digit DIN, so every
 * comparison ignores leading zeros and every lookup retries with them added back.
 */

/** Digits only, without padding. `digitsOf('0226-6687')` → `'02266687'`. */
export function digitsOf(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '');
}

/** Digits only, padded to eight characters. Returns null when there are no digits. */
export function normalizeDin(raw: unknown): string | null {
  const digits = digitsOf(raw);
  return digits ? digits.padStart(8, '0') : null;
}

/** Digits only, padded to eight characters. Returns `''` when there are no digits. */
export function padDin(raw: unknown): string {
  return normalizeDin(raw) ?? '';
}

/**
 * Candidate keys for a DIN, adding and then removing leading zeros, so a lookup can
 * still match a DIN that was stored with a different amount of padding.
 */
export function dinCandidates(digits: string): string[] {
  if (!digits) return [];

  const candidates = new Set<string>([digits, digits.padStart(8, '0')]);
  for (let length = digits.length + 1; length <= 8; length += 1) {
    candidates.add(digits.padStart(length, '0'));
  }

  const trimmed = digits.replace(/^0+/, '');
  if (trimmed && trimmed !== digits) {
    candidates.add(trimmed);
    candidates.add(trimmed.padStart(8, '0'));
  }

  return [...candidates];
}

/**
 * Compares two DINs ignoring separators and leading zeros, so a DIN pasted without its
 * leading zero (or with extra ones) still matches the stored value.
 */
export function isSameDin(left: unknown, right: unknown): boolean {
  const a = digitsOf(left).replace(/^0+/, '');
  const b = digitsOf(right).replace(/^0+/, '');
  return a !== '' && a === b;
}

/** True when a value carries enough digits to be treated as a DIN rather than a quantity. */
export function looksLikeDin(value: unknown): boolean {
  return digitsOf(value).length >= 6;
}

/** True when a value is a syntactically valid DIN (6–10 digits). */
export function isValidDin(value: unknown): boolean {
  return /^\d{6,10}$/.test(digitsOf(value));
}
