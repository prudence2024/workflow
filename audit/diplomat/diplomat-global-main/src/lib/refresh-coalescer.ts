/**
 * Refresh coalescer — root fix for duplicate admin shell fetches.
 *
 * The admin shell legitimately has several "something changed, refresh"
 * triggers that fire together: initial mount, `focus`, and
 * `visibilitychange` (returning to a browser tab fires BOTH of the latter).
 * Wiring each listener straight to a fetch produced 3-4 identical serverFn
 * calls per return-to-tab.
 *
 * This scheduler collapses:
 *   - concurrent calls      → one in-flight run (later callers join it)
 *   - burst calls           → one run per `minIntervalMs` window
 *
 * Pure and injectable (`now`) so the behavior is unit-testable without timers.
 */

export function shouldRefresh(
  lastRunAt: number | null,
  now: number,
  minIntervalMs: number,
): boolean {
  if (lastRunAt === null) return true;
  return now - lastRunAt >= minIntervalMs;
}

export interface CoalescedRefresh {
  /** Request a refresh. Concurrent/burst requests collapse into one run. */
  request: () => Promise<unknown>;
  /** Forget the last-run time (e.g. after an explicit user action). */
  reset: () => void;
  /** True while a run is in flight. */
  isPending: () => boolean;
}

export function createCoalescedRefresh(options: {
  run: () => unknown | Promise<unknown>;
  minIntervalMs?: number;
  now?: () => number;
}): CoalescedRefresh {
  const minIntervalMs = options.minIntervalMs ?? 5_000;
  const now = options.now ?? (() => Date.now());
  let lastRunAt: number | null = null;
  let inFlight: Promise<unknown> | null = null;

  return {
    request() {
      if (inFlight) return inFlight;
      const at = now();
      if (!shouldRefresh(lastRunAt, at, minIntervalMs)) return Promise.resolve(undefined);
      lastRunAt = at;
      inFlight = Promise.resolve()
        .then(() => options.run())
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
    reset() {
      lastRunAt = null;
      inFlight = null;
    },
    isPending() {
      return inFlight !== null;
    },
  };
}
