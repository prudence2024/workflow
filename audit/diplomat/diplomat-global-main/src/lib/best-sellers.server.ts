import { createServerFn } from "@tanstack/react-start";
import type { Product } from "@/lib/products";

/**
 * Homepage Best Sellers — authoritative sales ranking.
 *
 * Metric: the dashboard's existing canonical "Units Sold" definition
 * (adminGetSalesAnalytics, src/lib/admin/server-fns.ts): SUM(order_items.quantity)
 * over orders with status ∈ PAID_ORDER_STATUSES. Refund convention mirrors that
 * query exactly: fully-refunded orders carry status "refunded" and drop out;
 * partial refunds do not flip order status and remain counted (same as the
 * dashboard).
 *
 * Authoritative fence: only orders in a paid lifecycle status are aggregated.
 * Pending/failed/declined/cancelled/abandoned attempts never rank. Replayed
 * callbacks/webhooks cannot double-count because payment finalization is
 * exactly-once per order (payment_financial_completions PK), and this query
 * aggregates order_items — which exist once per (order, product) line.
 *
 * Fallback: deterministic — the canonical public catalogue order
 * (created_at DESC, newest first). Never random, never re-shuffled per render.
 */

/** Authoritative paid-order statuses — the same fence the dashboard and the review purchase proof use. */
export const PAID_ORDER_STATUSES = ["paid", "processing", "shipped", "delivered"] as const;

export const BEST_SELLER_COUNT = 4;

/**
 * Merge ranked sellers with deterministic fallback products into a fixed-size
 * list. Pure function — fully covered by tests.
 *
 * - `ranked` must already be sorted best-first by the caller.
 * - Sellers come first; missing slots are filled in catalogue order.
 * - A product already present as a ranked seller is never duplicated.
 * - Tie-breaking/stability are the caller's query's responsibility; this
 *   function preserves the given order of both inputs.
 */
export function fillBestSellers(ranked: Product[], catalogue: Product[]): Product[] {
  const out: Product[] = [];
  const seen = new Set<string>();
  for (const p of ranked) {
    if (out.length >= BEST_SELLER_COUNT) break;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  for (const p of catalogue) {
    if (out.length >= BEST_SELLER_COUNT) break;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

/**
 * Aggregate units sold per product from order_items joined to paid-lifecycle
 * orders, then rank the given catalogue products by units sold.
 *
 * Two reads, no N+1, no browser-side scanning:
 *  1. order_items(id, product_id, quantity, orders!inner(status)) filtered to
 *     PAID_ORDER_STATUSES.
 *  2. The caller-supplied catalogue provides the only products that can rank
 *     (active/public visibility rules already applied upstream) and its order
 *     is the deterministic fallback.
 *
 * On any aggregation failure the caller degrades to the fallback list — the
 * homepage must never go down because ranking failed.
 */
export async function loadBestSellerRanking(
  db: { from: (table: string) => any },
  catalogue: Product[],
): Promise<{ products: Product[]; ranked: boolean }> {
  const catalogueIds = new Set(catalogue.map((p) => p.id));
  const { data: items, error } = await db
    .from("order_items")
    .select("product_id, quantity, orders!inner(status)")
    .in("orders.status", [...PAID_ORDER_STATUSES]);
  if (error) throw new Error("Best-seller aggregation failed.");

  const unitsByProduct = new Map<string, number>();
  for (const item of items ?? []) {
    const pid = item.product_id as string;
    // Only rank products the public catalogue can actually display.
    if (!catalogueIds.has(pid)) continue;
    unitsByProduct.set(pid, (unitsByProduct.get(pid) ?? 0) + Number(item.quantity || 0));
  }

  // Stable rank: units DESC, then catalogue order (created_at DESC) as the
  // deterministic tie-breaker — identical inputs always produce identical output.
  const ranked = catalogue
    .map((product, catalogueIndex) => ({
      product,
      catalogueIndex,
      units: unitsByProduct.get(product.id) ?? 0,
    }))
    .filter((r) => r.units > 0)
    .sort((a, b) => b.units - a.units || a.catalogueIndex - b.catalogueIndex)
    .map((r) => r.product);

  return {
    products: fillBestSellers(ranked, catalogue),
    // `ranked` is true only when real successful-sales data produced the head
    // of the list; a pure-fallback storefront reports ranked=false.
    ranked: ranked.length > 0,
  };
}

/**
 * Homepage product sections, composed from ONE catalogue fetch (the homepage
 * loader consumes products only through these two sections, so a separate
 * best-seller serverFn would duplicate the full catalogue query per view).
 *
 * featured: admin-flagged products, canonical order, max 4 (unchanged behavior).
 * bestSellers: authoritative top-4 by units sold, deterministic fallback fill.
 *
 * Degradation: catalogue failure throws (homepage shows its truthful
 * error/stale state); best-seller AGGREGATION failure only degrades that one
 * section to the deterministic fallback — the homepage never goes down.
 */
export const getPublicHomeProductSections = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPublicProducts } = await import("./admin/server-fns");
  const { products } = await loadPublicProducts();

  const featured = products.filter((p) => p.featured).slice(0, 4);

  try {
    const { createDatabaseClient } = await import("./admin/admin-ops.server");
    const bestSellers = await loadBestSellerRanking(createDatabaseClient(), products);
    return { featured, bestSellers: bestSellers.products, bestSellersRanked: bestSellers.ranked };
  } catch (err) {
    console.error(
      "[getPublicHomeProductSections] aggregation failed, using catalogue fallback:",
      err,
    );
    return {
      featured,
      bestSellers: fillBestSellers([], products),
      bestSellersRanked: false,
    };
  }
});
