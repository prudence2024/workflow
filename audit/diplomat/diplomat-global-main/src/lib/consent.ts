/**
 * Cookie/consent store — one authority for optional-tracking consent.
 *
 * Categories: NECESSARY (always on, not stored as a choice), ANALYTICS
 * (GA4 measurement cookies), MARKETING (Meta Pixel).
 *
 * Storage: localStorage "dg-cookie-consent". Every change dispatches a
 * "dg:consent-changed" DOM event so consent-gated loaders can react live.
 */

export interface ConsentState {
  analytics: boolean;
  marketing: boolean;
}

const STORAGE_KEY = "dg-cookie-consent";
export const CONSENT_CHANGED_EVENT = "dg:consent-changed";

function isValid(value: unknown): value is ConsentState {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ConsentState).analytics === "boolean" &&
    typeof (value as ConsentState).marketing === "boolean"
  );
}

/** Returns the stored consent, or null while the visitor has not decided. */
export function readConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeConsent(state: ConsentState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage optional — consent then re-asks each visit, never tracks silently */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT));
}

export function onConsentChange(listener: () => void): () => void {
  window.addEventListener(CONSENT_CHANGED_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CONSENT_CHANGED_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
