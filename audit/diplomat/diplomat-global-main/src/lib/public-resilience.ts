// Public network-resilience model.
//
// Pure and client-safe: no secrets, no server imports. Public loaders and
// components share this so that a failed request never masquerades as an
// empty catalogue, and already-visible content survives a failed
// revalidation (last-known-good).

export const RESILIENCE_COPY = {
  unableToConnect: "Unable to connect. Check your internet connection and try again.",
  stale: "Connection is unstable. Showing the latest available content.",
  contentUnavailable: "Some content is temporarily unavailable. Please try again.",
  searchUnavailable: "Search is unavailable right now. Check your connection and try again.",
  adminUnreachable: "We couldn't reach the admin service. Check your connection and try again.",
  retry: "Retry",
} as const;

/** A section's honest outcome: successful data, a real empty result, or failure. */
export type SectionStatus = "loaded" | "empty" | "error" | "stale";

/**
 * Classify a section's data against whether its request failed.
 * - data present + no failure  → loaded
 * - data present + failure     → stale (last-known-good must stay visible)
 * - no data + failure          → error (never render as a legitimate empty state)
 * - no data + no failure       → empty (a real, confirmed empty catalogue)
 */
export function resolveSection<T>(items: T[], failed: boolean): { status: SectionStatus; items: T[] } {
  if (items.length > 0) return failed ? { status: "stale", items } : { status: "loaded", items };
  return failed ? { status: "error", items } : { status: "empty", items };
}

/** Heuristic classification of a thrown failure as network-related vs server-side. */
export function isNetworkError(err: unknown): boolean {
  const name = (err as { name?: string } | null | undefined)?.name;
  if (name === "TypeError" || name === "AbortError" || name === "TimeoutError") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /failed to fetch|fetch failed|network|timed? ?out|load failed|aborted|socket/i.test(message);
}

/** Truthful user-facing copy for a failed request. */
export function failureCopy(err: unknown): string {
  return isNetworkError(err) ? RESILIENCE_COPY.unableToConnect : RESILIENCE_COPY.contentUnavailable;
}

/**
 * Bounded keyed cache of last-known-good public data, keyed by the exact
 * query parameters that produced it. On a failed revalidation with the same
 * key the cached value is returned with a stale flag instead of wiping the
 * section. Entries are evicted oldest-first once maxEntries is exceeded.
 */
export function createLkgCache<V>(maxEntries = 20) {
  const map = new Map<string, V>();
  return {
    get(key: string): V | undefined {
      return map.get(key);
    },
    set(key: string, value: V): void {
      map.delete(key); // refresh recency for LRU-ish eviction
      map.set(key, value);
      if (map.size > maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
    },
  };
}
