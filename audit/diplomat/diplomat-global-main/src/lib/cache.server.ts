/**
 * Lightweight in-memory TTL cache for server-side data.
 *
 * This cache lives within a single serverless function instance. It reduces
 * redundant Supabase queries when multiple server functions are called
 * during the same SSR request cycle. It does NOT persist across cold starts.
 *
 * For cross-request caching, use HTTP Cache-Control headers via Vercel/CDN.
 */

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const store = new Map<string, CacheEntry<any>>();
const MAX_ENTRIES = 100;

/**
 * Get a cached value or compute and store it.
 * TTL is in milliseconds.
 */
export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = store.get(key);
  if (entry && entry.expires > now) {
    return entry.data as T;
  }

  const data = await compute();

  // Evict oldest if at capacity
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }

  store.set(key, { data, expires: now + ttlMs });
  return data;
}

/** Invalidate a specific cache key */
export function invalidateCache(key: string): void {
  store.delete(key);
}

/** Invalidate all keys matching a prefix */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

// ──────────────────────────────────────────────────────
// Pre-defined TTL constants (milliseconds)
// ──────────────────────────────────────────────────────
export const TTL = {
  /** Hero slides, social links, site settings — change rarely */
  LONG: 10 * 60 * 1000, // 10 minutes
  /** Categories, testimonials — moderate volatility */
  MEDIUM: 5 * 60 * 1000, // 5 minutes
  /** Product catalogue — more volatile */
  SHORT: 2 * 60 * 1000, // 2 minutes
  /** Blog posts — moderate */
  BLOG: 5 * 60 * 1000, // 5 minutes
  /** Product detail — shorter for stock/price accuracy */
  PRODUCT: 1 * 60 * 1000, // 1 minute
} as const;
