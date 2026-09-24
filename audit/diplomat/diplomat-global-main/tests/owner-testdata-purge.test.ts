import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * §14 — Owner-only TEST DATA purge contract.
 *
 * DESTRUCTIVE tool, so its safety properties are pinned as source contracts:
 * - BOTH preview and execute authorize via requireOwner (server-side Owner role).
 * - mode defaults to "preview" — blind execution is impossible.
 * - Execute requires the exact typed confirmation phrase.
 * - At least one explicit filter is mandatory — nothing is "inferred as test".
 * - Financial-ledger-protected orders (payment_financial_completions) are
 *   reported, never deleted.
 * - Catalog tables (products, categories, pages, blog, settings) are NEVER
 *   touched — only commerce rows for the explicitly selected orders.
 * - Every execute writes a permanent audit_logs entry (clerk-attributed).
 */

const SOURCE = readFileSync(
  new URL("../src/lib/admin/testdata-purge.server.ts", import.meta.url),
  "utf8",
);
const PAGE = readFileSync(
  new URL("../src/routes/dashboard.test-data.tsx", import.meta.url),
  "utf8",
);

describe("owner test-data purge safety contract", () => {
  it("authorizes EVERY call through requireOwner (not client-side gating)", () => {
    expect(SOURCE).toMatch(/await requireOwner\(\)/);
    // The handler must return (fail closed) when auth fails, before any DB access.
    expect(SOURCE).toMatch(/if \(authError\) return \{ ok: false as const, message: authError \}/);
    // And the UI page itself must never import the destructive server module directly.
    expect(PAGE).not.toMatch(/testdata-purge\.server/);
  });

  it("defaults to dry-run and cannot execute without the typed confirmation phrase", () => {
    expect(SOURCE).toMatch(/mode: z\.enum\(\["preview", "execute"\]\)\.default\("preview"\)/);
    expect(SOURCE).toMatch(/confirmation !== CONFIRMATION_PHRASE/);
    expect(SOURCE).toMatch(/PURGE TEST DATA/);
  });

  it("refuses to run without at least one explicit filter (never infers 'test')", () => {
    expect(SOURCE).toMatch(/At least one explicit filter is required/);
    expect(SOURCE).toMatch(/order_reference|created_before|created_after|email/);
  });

  it("only deletes commerce rows for the explicitly selected orders — catalog untouched", () => {
    const deleteTables = [
      ...SOURCE.matchAll(/db\s*\n?\s*\.from\("([a-z_]+)"\)\s*\n?\s*\.delete\(\)/g),
    ].map((m) => m[1]);
    // customers may only be deleted when include_customers=true AND every order
    // referencing them is inside the purge set (no remaining external links).
    expect(deleteTables.sort()).toEqual([
      "coupon_reservations",
      "customers",
      "order_items",
      "orders",
      "payment_transactions",
      "receipts",
      "review_claims",
    ]);
    expect(SOURCE).toMatch(/include_customers/);
    expect(SOURCE).toMatch(/externallyLinked/);
    for (const forbidden of [
      "products",
      "categories",
      "site_pages",
      "blog_posts",
      "site_settings",
    ]) {
      expect(deleteTables).not.toContain(forbidden);
    }
  });

  it("protects financial-ledger orders and reports them instead of deleting", () => {
    expect(SOURCE).toMatch(/payment_financial_completions/);
    expect(SOURCE).toMatch(/blockedOrderIds/);
    expect(SOURCE).toMatch(
      /deletable = selected\.filter\(\(o\) => !blockedOrderIds\.has\(o\.id\)\)/,
    );
  });

  it("deletes children before parents (FK-safe ordering)", () => {
    const order = [
      "review_claims",
      "receipts",
      "payment_transactions",
      "coupon_reservations",
      "order_items",
      "orders",
    ];
    // Table names appear as step labels or table selectors; order in file = execution order.
    const positions = order.map((t) => SOURCE.indexOf(`"${t}",`));
    expect(positions.every((p) => p > 0)).toBe(true);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it("writes a permanent clerk-attributed audit record on every execute", () => {
    expect(SOURCE).toMatch(/logAudit\(\s*"testdata\.purge",\s*"test_data"/);
    expect(SOURCE).toMatch(/audit_recorded: true/);
  });

  it("selection is bounded and deterministic (limit + stable ordering)", () => {
    expect(SOURCE).toMatch(/\.order\("created_at"\)/);
    expect(SOURCE).toMatch(/\.limit\(500\)/);
  });

  it("hitting the selection cap refuses instead of silently purging a subset", () => {
    expect(SOURCE).toMatch(/selected\.length === 500/);
    expect(SOURCE).toMatch(/exceeds the 500-order safety cap/);
  });

  it("derived state needs no cache purge — analytics and Best Sellers aggregate live per request", () => {
    // Best Sellers: loadBestSellerRanking aggregates order_items per request and
    // only ranks catalogue products; deleted test orders therefore stop influencing
    // ranking at the NEXT request (verified: no materialized ranking store exists).
    const BEST = readFileSync(
      new URL("../src/lib/best-sellers.server.ts", import.meta.url),
      "utf8",
    );
    expect(BEST).toMatch(/loadBestSellerRanking/);
    expect(BEST).toMatch(/filter\(\(r\) => r\.units > 0\)/); // zero qualifying sales → pure fallback
    const HOME = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
    expect(HOME).toMatch(/dbBestSellersRanked \? "Best sellers" : "Featured picks"/);
    // Analytics: units sold is a per-request reduce over fetched order_items (no cache).
    const FNS = readFileSync(new URL("../src/lib/admin/server-fns.ts", import.meta.url), "utf8");
    expect(FNS).toMatch(/unitsSold = items\.reduce/);
  });

  it("normal Admin / signed-out callers are denied server-side, not just hidden from the UI", () => {
    // requireOwner = requireAdmin (active Clerk session + admin_users row) AND role_key === 'owner'.
    // The handler returns the denial string BEFORE any DB access (asserted above), so a
    // non-owner who discovers the serverFn directly gets a denial result, never data.
    const OPS = readFileSync(
      new URL("../src/lib/admin/admin-ops.server.ts", import.meta.url),
      "utf8",
    );
    expect(OPS).toMatch(/export async function requireOwner/);
    expect(OPS).toMatch(/role_key !== "owner"/);
    expect(OPS).toMatch(/This action is restricted to the Owner\./);
  });
});
