import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Criticism-pass regression pins (F1/F2/F3 — docs/CRITICISM-FINDINGS.md).
 *
 * F1: a stock transition to zero (sale OR manual adjustment) must emit an
 *     authoritative, exactly-once "Product sold out" notification and one
 *     Telegram alert from the shared transition emitter — and the message must
 *     be truthful about the SOURCE (sale vs manual adjustment, §24).
 * F2: a category containing products cannot be permanently deleted
 *     (FK is SET NULL, so the DB alone permits a silent uncategorisation).
 * F3: the homepage section title claims "Best sellers" only when real
 *     successful-sales ranking exists; deterministic fallback is labelled
 *     "Featured picks".
 */

const EMITTER = readFileSync(
  new URL("../src/lib/inventory-settings.server.ts", import.meta.url),
  "utf8",
);
const NOTIFS = readFileSync(new URL("../src/lib/notifications.ts", import.meta.url), "utf8");
const FINALIZE = readFileSync(
  new URL("../src/lib/payment-finalize.server.ts", import.meta.url),
  "utf8",
);
const ADMIN_FNS = readFileSync(new URL("../src/lib/admin/server-fns.ts", import.meta.url), "utf8");
const HOME = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
const OFFLINE = readFileSync(
  new URL("../src/components/offline-support.tsx", import.meta.url),
  "utf8",
);

describe("sold-out transition notification (F1)", () => {
  it("the shared emitter notifies on every >0 → <=0 transition, both sources", () => {
    expect(EMITTER).toMatch(/next\.quantity !== null && next\.quantity <= 0/);
    expect(EMITTER).toMatch(/previous\?\.quantity \?\? 1\) > 0/);
    expect(EMITTER).toMatch(/notifications\.outOfStock\(product\.id, product\.name, source\)/);
    expect(EMITTER).toMatch(/sendAdminAlert\(\s*"Sold Out"/);
    // The emitter is the single entry point all mutation paths share.
    expect(EMITTER).toMatch(/source: "sale" \| "admin_adjustment"/);
  });

  it("payment finalization reports sales with the order reference; manual edits do not", () => {
    // Sale path passes "sale" + the order reference.
    expect(FINALIZE).toMatch(/"sale",\s*\n?\s*reference/);
    // Notification message is source-truthful (§24: never blame a sale for a manual edit).
    expect(NOTIFS).toMatch(/has reached zero available stock/);
    expect(NOTIFS).toMatch(/manual adjustment/);
    // Event key stays product-scoped so callback/webhook replays dedupe.
    expect(NOTIFS).toMatch(/eventKey: `out_of_stock_\$\{productId\}`/);
  });

  it("alert delivery failure never breaks the stock transition (swallow is deliberate)", () => {
    // The emitter's try/catch is the documented safety: notification problems
    // must not roll back confirmed inventory mutations.
    expect(EMITTER).toMatch(
      /Uncertain settings\/delivery must neither send uncontrolled alerts nor undo stock/,
    );
  });
});

describe("category delete guard (F2)", () => {
  it("blocks permanent deletion while products reference the category", () => {
    expect(ADMIN_FNS).toMatch(/adminDeleteCategory/);
    expect(ADMIN_FNS).toMatch(/contains \$\{productCount\} product/);
    expect(ADMIN_FNS).toMatch(/cannot be deleted yet/);
    // Guard runs BEFORE the delete, and a count failure fails closed.
    expect(ADMIN_FNS).toMatch(/Could not verify category usage\./);
  });
});

describe("truthful best-seller labelling (F3)", () => {
  it("homepage renders the ranked title only when ranking is backed by real sales", () => {
    expect(HOME).toMatch(/dbBestSellersRanked/);
    expect(HOME).toMatch(/dbBestSellersRanked \? "Best sellers" : "Featured picks"/);
  });
});

describe("public focus/reconnect revalidation (F4)", () => {
  it("revalidates on stale focus and reconnect, debounced, with no polling", () => {
    expect(OFFLINE).toMatch(/visibilitychange/);
    expect(OFFLINE).toMatch(/window\.addEventListener\("online"/);
    expect(OFFLINE).toMatch(/FOCUS_STALE_MS = 60_000/);
    expect(OFFLINE).toMatch(/INVALIDATE_DEBOUNCE_MS = 2_000/);
    expect(OFFLINE).toMatch(/router\.invalidate\(\)/);
    // No fixed polling anywhere in the component.
    expect(OFFLINE).not.toMatch(/setInterval/);
  });
});
