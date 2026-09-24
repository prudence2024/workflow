/**
 * Whitespace-tolerant product-slug lookup.
 *
 * WHY THIS EXISTS
 * ---------------
 * Product records were historically stored with a trailing space in `slug`
 * (18 of 40 rows as of the 2026-09-21 audit). Two consequences follow, and a
 * lookup must survive BOTH sides of the pending normalization:
 *
 *   - before normalization: the row is `"Ls32a700nwnxza "`, so only a request
 *     that carries the space (i.e. the url-encoded `%20` form used by the
 *     storefront's own links) matches an exact `eq("slug", …)`.
 *   - after normalization: the row is `"Ls32a700nwnxza"`, so only a clean
 *     request matches — every previously shared `%20` link would 404.
 *
 * Accepting the canonical value plus its edge-whitespace variants keeps the
 * clean and dirty forms resolving to the SAME product throughout, which is
 * what makes the prepared slug-normalization migration safe to apply without
 * breaking existing links. Inner whitespace is deliberately preserved: it is
 * legitimate data (e.g. `"LG 34wp75c-b"`).
 */

/** Canonical slug plus its leading/trailing-space variants (deduplicated). */
export function productSlugCandidates(rawSlug: string): string[] {
  const canonical = rawSlug.trim();
  if (!canonical) return [];
  return [...new Set([canonical, `${canonical} `, ` ${canonical}`])];
}

/**
 * Prefer the exact canonical row when several whitespace variants matched, so
 * the result is stable and deterministic rather than dependent on row order.
 */
export function pickProductBySlug<T extends { slug: string }>(
  rows: T[] | null | undefined,
  rawSlug: string,
): T | null {
  if (!rows || rows.length === 0) return null;
  const canonical = rawSlug.trim();
  return rows.find((row) => row.slug === canonical) ?? rows[0];
}
