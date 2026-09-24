/**
 * International human-name validation.
 *
 * Supports real-world names from ANY writing system:
 * - Unicode letters \p{L} (Latin, Cyrillic, Arabic, CJK, Devanagari, etc.)
 * - Unicode combining marks \p{M} (accents, diacritics)
 * - Normal spaces, non-breaking spaces
 * - Apostrophes: ' (U+0027), ' (U+2019), ʼ (U+02BC)
 * - Hyphens: - (U+002D), – (U+2013), ‐ (U+2010)
 * - Periods for initials: J.K. Rowling
 *
 * Accepts:
 *   O'Connor, Anne-Marie, María José, Nguyễn An, Jean-Pierre, Zoë,
 *   राम सिंह, Иванов Иван, 李明, おはよう, José María García López
 *
 * Rejects:
 *   12345, Prudence123, $$$$$, <script>, names that are only punctuation
 */

// Must start with a letter, contain at least one letter after optional marks,
// and only allow letters, marks, spaces, apostrophes, hyphens, and periods.
// Minimum 2 chars, maximum 120.
const VALID_NAME_RE = /^\p{L}[\p{L}\p{M}\s''ʼ.\-–‐]{0,118}\p{L}$/u;
// Relaxed for single-char names (common in some cultures):
const VALID_NAME_SINGLE_RE = /^\p{L}([\p{L}\p{M}\s''ʼ.\-–‐]{0,119}\p{L})?$/u;

/**
 * Validate a personal name field.
 * Returns null if valid, or an error message string.
 *
 * Client + server usable (pure function, no side effects).
 */
export function validateName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Name is required.";
  if (trimmed.length < 1) return "Name must be at least 1 character.";
  if (trimmed.length > 120) return "Name must be 120 characters or fewer.";

  // Unicode normalize to NFC (canonical decomposition + recomposition)
  const normalized = trimmed.normalize("NFC");

  // Must contain at least one Unicode letter
  const hasLetter = /\p{L}/u.test(normalized);
  if (!hasLetter) return "Name must contain at least one letter.";

  // Check pattern: starts and ends with letter, allowed chars in between
  if (!VALID_NAME_SINGLE_RE.test(normalized)) {
    return "Name contains invalid characters. Use only letters, spaces, apostrophes, hyphens, or periods.";
  }

  // Reject strings that are mostly punctuation (e.g., "----", "''''")
  const letterCount = (normalized.match(/\p{L}/gu) || []).length;
  const totalCount = normalized.length;
  if (letterCount / totalCount < 0.3) {
    return "Name must be primarily letters.";
  }

  // Reject control characters and unusual Unicode
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(normalized)) {
    return "Name contains invalid control characters.";
  }

  return null;
}

/**
 * Zod-compatible validator (for server-side schemas).
 */
export function nameValidator(value: string): boolean {
  return validateName(value) === null;
}

/**
 * Quick check — does this name contain any digits?
 */
export function hasDigits(value: string): boolean {
  return /\d/.test(value);
}
