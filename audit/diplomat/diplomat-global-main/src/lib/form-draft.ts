/**
 * Shared non-sensitive public form-draft persistence.
 *
 * Purpose: a refresh or network interruption must never wipe what a visitor
 * typed. Scope: THIS TAB SESSION ONLY (sessionStorage) — a fresh visit starts
 * clean and a different tab never inherits another tab's inputs.
 *
 * Behaviour contract:
 *   - on field change  → debounced save (500 ms)
 *   - on mount         → restore allowlisted fields
 *   - failed submission / timeout / validation error → draft is KEPT
 *   - confirmed server success / explicit discard → clearFormDraft()
 *
 * Security contract (enforced, not by convention):
 *   - Strict per-form field allowlist; unknown keys are dropped before
 *     serialization. NEVER persists passwords, card numbers, CVV, PIN, OTP,
 *     authorization data, session tokens, or API keys.
 *   - String/boolean values only, hard length cap, type-checked on read and
 *     write. The honeypot and any checkbox the user must re-confirm each
 *     session can simply be left out of the allowlist.
 *
 * File inputs are deliberately NOT persisted: browsers cannot restore File
 * objects from storage, and persisting uploaded file bodies would put
 * un-scanned user content on disk. Forms with uploads should tell the user
 * a selected file may need to be re-selected.
 *
 * The storage semantics live in pure functions (readFormDraft /
 * writeFormDraft / clearFormDraft) so they are unit-testable without a DOM;
 * useFormDraft is the thin React binding call sites consume.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const FORM_DRAFT_DEBOUNCE_MS = 500;
/** Hard cap per field — drafts hold contact inputs, not documents. */
const MAX_DRAFT_FIELD_LENGTH = 240;

export type FormDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Returns a usable tab-session storage, or null when unavailable (SSR/private mode). */
export function defaultFormDraftStorage(): FormDraftStorage | null {
  if (typeof window === "undefined") return null;
  try {
    const probe = "dg-draft-probe";
    window.sessionStorage.setItem(probe, "1");
    window.sessionStorage.removeItem(probe);
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Projects arbitrary input onto the allowlist with type/length enforcement. */
export function sanitizeFormDraft<T extends Record<string, string | boolean>>(
  input: unknown,
  allowlist: readonly (keyof T & string)[],
): T {
  const draft = {} as T;
  if (typeof input !== "object" || input === null || Array.isArray(input)) return draft;
  const record = input as Record<string, unknown>;
  for (const field of allowlist) {
    const value = record[field];
    if (typeof value === "string") {
      (draft[field] as unknown) = value.slice(0, MAX_DRAFT_FIELD_LENGTH);
    } else if (typeof value === "boolean") {
      (draft[field] as unknown) = value;
    }
  }
  return draft;
}

/** Restore allowlisted draft values. Corrupt/absent storage yields {}. */
export function readFormDraft<T extends Record<string, string | boolean>>(
  storage: FormDraftStorage | null,
  storageKey: string,
  allowlist: readonly (keyof T & string)[],
): T {
  if (!storage) return {} as T;
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return {} as T;
    return sanitizeFormDraft<T>(JSON.parse(raw), allowlist);
  } catch {
    // Corrupt or inaccessible storage — a draft is never worth an error.
    return {} as T;
  }
}

/**
 * Persist allowlisted draft values. Drafts where every field is empty are
 * removed instead of stored. Strictly best-effort: storage failures are
 * swallowed because a draft is never worth an error.
 */
export function writeFormDraft<T extends Record<string, string | boolean>>(
  storage: FormDraftStorage | null,
  storageKey: string,
  values: T,
  allowlist: readonly (keyof T & string)[],
): void {
  if (!storage) return;
  try {
    const sanitized = sanitizeFormDraft<T>(values, allowlist);
    const hasAny = Object.values(sanitized).some((value) =>
      typeof value === "boolean" ? value : value.length > 0,
    );
    if (hasAny) storage.setItem(storageKey, JSON.stringify(sanitized));
    else storage.removeItem(storageKey);
  } catch {
    // Storage full/private mode — draft persistence is strictly best-effort.
  }
}

/** Remove the draft entirely (confirmed success / explicit discard). */
export function clearFormDraft(storage: FormDraftStorage | null, storageKey: string): void {
  if (!storage) return;
  try {
    storage.removeItem(storageKey);
  } catch {
    // Nothing to clear is a fine outcome.
  }
}

export interface FormDraft<T extends Record<string, string | boolean>> {
  /** True once the mounted restore has run — gate saves on this. */
  ready: boolean;
  /** Restored draft values (empty object before mount). */
  values: Partial<T>;
  /** Debounced persist of the current allowlisted values. */
  save: (values: T) => void;
  /** Remove the draft entirely (confirmed success / explicit discard). */
  clear: () => void;
}

/**
 * One mechanism for all public form drafts.
 *
 * The hook never owns form state: call `save(values)` from existing change
 * handlers (it debounces), and merge `values` into initial state after mount.
 */
export function useFormDraft<T extends Record<string, string | boolean>>(
  storageKey: string,
  allowlist: readonly (keyof T & string)[],
): FormDraft<T> {
  const storageRef = useRef<FormDraftStorage | null>(null);
  const getStorage = (): FormDraftStorage | null =>
    (storageRef.current ??= defaultFormDraftStorage());

  const [ready, setReady] = useState(false);
  const [values, setValues] = useState<Partial<T>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<T | null>(null);

  useEffect(() => {
    setValues(readFormDraft<T>(getStorage(), storageKey, allowlist));
    setReady(true);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // storageKey/allowlist are per-call-site constants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const save = useCallback(
    (next: T) => {
      pendingRef.current = next;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        if (!pending) return;
        writeFormDraft(getStorage(), storageKey, pending, allowlist);
      }, FORM_DRAFT_DEBOUNCE_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey],
  );

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    clearFormDraft(getStorage(), storageKey);
  }, [storageKey]);

  return useMemo(() => ({ ready, values, save, clear }), [ready, values, save, clear]);
}
