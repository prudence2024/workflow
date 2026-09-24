/**
 * Non-sensitive checkout draft persistence.
 *
 * Purpose: an ordinary page refresh must not wipe what the customer typed.
 * Scope: THIS TAB SESSION ONLY (sessionStorage) — a fresh visit starts clean;
 * a different tab never inherits another tab's delivery details.
 *
 * Security contract (enforced, not by convention):
 *  - Strict field allowlist. Unknown keys are dropped before serialization.
 *  - NEVER persisted here: card numbers, CVV, PIN, OTP, tokens, passwords,
 *    session secrets, payment credentials. The payment provider owns all of
 *    those; this module structurally cannot persist them.
 *  - Length-capped, type-checked values only.
 */

export const CHECKOUT_DRAFT_STORAGE_KEY = "dg-checkout-draft";

export interface CheckoutDraft {
  fullName: string;
  email: string;
  phone: string;
  state: string;
  lga: string;
  city: string;
  address: string;
}

const DRAFT_FIELD_ALLOWLIST = [
  "fullName",
  "email",
  "phone",
  "state",
  "lga",
  "city",
  "address",
] as const satisfies ReadonlyArray<keyof CheckoutDraft>;

/** Hard cap per field — these are contact/delivery inputs, not documents. */
const MAX_FIELD_LENGTH = 240;

export const emptyCheckoutDraft: CheckoutDraft = {
  fullName: "",
  email: "",
  phone: "",
  state: "",
  lga: "",
  city: "",
  address: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Projects arbitrary input onto the allowlist with type/length enforcement. */
export function sanitizeCheckoutDraft(input: unknown): CheckoutDraft {
  const draft: CheckoutDraft = { ...emptyCheckoutDraft };
  if (!isRecord(input)) return draft;
  for (const field of DRAFT_FIELD_ALLOWLIST) {
    const value = input[field];
    if (typeof value !== "string") continue;
    draft[field] = value.slice(0, MAX_FIELD_LENGTH);
  }
  return draft;
}

export function loadCheckoutDraft(): CheckoutDraft {
  if (typeof window === "undefined") return { ...emptyCheckoutDraft };
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_DRAFT_STORAGE_KEY);
    if (!raw) return { ...emptyCheckoutDraft };
    return sanitizeCheckoutDraft(JSON.parse(raw));
  } catch {
    // Corrupt or inaccessible storage — a draft is never worth an error.
    return { ...emptyCheckoutDraft };
  }
}

export function saveCheckoutDraft(draft: CheckoutDraft): void {
  if (typeof window === "undefined") return;
  try {
    // Sanitize on write too: the allowlist holds even for future callers.
    window.sessionStorage.setItem(
      CHECKOUT_DRAFT_STORAGE_KEY,
      JSON.stringify(sanitizeCheckoutDraft(draft)),
    );
  } catch {
    // Storage full/private mode — draft persistence is strictly best-effort.
  }
}

export function clearCheckoutDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CHECKOUT_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore — nothing to clear is a fine outcome.
  }
}
