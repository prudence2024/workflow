/**
 * In-flight request joiner — collapses concurrent identical admin fetches.
 *
 * WHY THIS EXISTS
 * ---------------
 * Admin page components mount twice in this app. Verified live on
 * 2026-09-21 with temporary instrumentation on /dashboard/receipts: the data
 * effect ran twice with UNCHANGED deps (page=1, search="") and produced two
 * concurrent identical `adminListReceipts` calls ~1ms apart. Two effect runs
 * with unchanged deps means two mounts, which is why a component-local
 * `useRef` cannot dedupe this — the second mount gets a fresh ref.
 *
 * The join therefore has to live outside the component instance, keyed by an
 * exact request signature.
 *
 * SEMANTICS
 *   - Same key, already in flight  → callers share that one promise.
 *   - Same key, previous settled   → a real new request (so paging back to
 *     page 1, or re-running a search, is never silently swallowed).
 *   - Different keys               → fully independent.
 *   - Rejection                    → entry cleared, so retries still work.
 */

const inFlight = new Map<string, Promise<unknown>>();

export function joinInFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = run().finally(() => {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

/** Diagnostics + tests. */
export function inFlightCount(): number {
  return inFlight.size;
}

export function __resetInFlightForTests(): void {
  inFlight.clear();
}
