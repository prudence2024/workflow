import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

// ── Phase 4A: deterministic head hydration ──────────────────────────────────
// Runtime evidence identified theme-color in links; charset is document-owned.

describe("head determinism (React #418 root cause)", () => {
  const root = read("src/routes/__root.tsx");

  it("does not declare charSet in route head meta", () => {
    expect(root).not.toMatch(/charSet\s*:/);
    expect(root.match(/<meta charSet="utf-8"/g)?.length).toBe(1);
  });

  it("declares viewport exactly once", () => {
    expect(root.match(/name: "viewport"/g)?.length).toBe(1);
  });

  it("declares theme-color exactly once and theme-independent", () => {
    expect(root.match(/theme-color/g)?.length).toBe(1);
    const line = root.split("\n").find((l) => l.includes("theme-color")) ?? "";
    expect(line).toContain("#0891b2");
    expect(line).not.toMatch(/\?|\?\?|\|\|/);
    expect(root.slice(root.indexOf("    links:"), root.indexOf("  loader:"))).not.toContain(
      "theme-color",
    );
  });

  it("keeps the narrow html-level suppression for the theme script only", () => {
    expect(root).toMatch(/<html lang="en" suppressHydrationWarning>/);
  });

  it("ships no temporary hydration diagnostics in router.tsx", () => {
    const router = read("src/router.tsx");
    expect(router).not.toMatch(/__dgHydrationInstrumented/);
    expect(router).not.toMatch(/dg-hydration-cap/);
  });
});

// ── Phase 4C: customer identity integrity ───────────────────────────────────
// Official names must never be inferred from email prefixes. Name and Email
// are distinct fields; historical missing names render as "Not provided".

describe("customer name integrity", () => {
  it.each([
    "src/routes/dashboard.orders.tsx",
    "src/routes/dashboard.transactions.tsx",
    "src/routes/dashboard.transactions.$id.tsx",
  ])("%s has no email-derived name fallback", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/\.trim\(\)\s*\|\|\s*order\.email/);
    expect(src).not.toMatch(/\.trim\(\)\s*\|\|\s*order\?\.email/);
    expect(src).toMatch(/Not provided/);
  });

  it("customer detail no longer presents the email as the name", () => {
    const src = read("src/routes/dashboard.customers.$id.tsx");
    expect(src).not.toMatch(/\.trim\(\)\s*\|\|\s*customer\.email/);
  });

  it("telegram audit summaries do not reduce actor emails to prefixes", () => {
    const src = read("src/lib/telegram/commands/audit.server.ts");
    expect(src).not.toMatch(/actor_email\.split\("@"\)\[0\]/);
  });
});

// ── Phase 4B: admin list state ownership ────────────────────────────────────
// The loader (driven by URL search params) is the single source of truth for
// admin list data. Copying loader data into local state and immediately
// refetching in an effect produced stale-first renders and duplicate requests.

describe("admin list state ownership", () => {
  it.each([
    "src/routes/dashboard.orders.tsx",
    "src/routes/dashboard.transactions.tsx",
    "src/routes/dashboard.customers.tsx",
    "src/routes/dashboard.products.tsx",
  ])("%s reads list data from the route loader, not a state copy", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/useState<any\[\]>\(loaderData\./);
    expect(src).not.toMatch(/useState\(loaderData\./);
    expect(src).toMatch(/Route\.useLoaderData\(\)/);
  });

  it.each([
    "src/routes/dashboard.orders.tsx",
    "src/routes/dashboard.transactions.tsx",
    "src/routes/dashboard.customers.tsx",
  ])("%s refresh performs an authoritative re-read via router.invalidate", (file) => {
    const src = read(file);
    expect(src).toMatch(/await router\.invalidate\(\{ sync: true \}\)/);
  });

  it.each([
    "src/routes/dashboard.orders.tsx",
    "src/routes/dashboard.transactions.tsx",
    "src/routes/dashboard.customers.tsx",
    "src/routes/dashboard.products.tsx",
  ])("%s debounces search into the URL instead of refetch-per-keystroke", (file) => {
    const src = read(file);
    expect(src).toMatch(/setTimeout/);
    expect(src).toMatch(/searchInput === urlSearch/);
  });

  it.each([
    "src/routes/dashboard.orders.tsx",
    "src/routes/dashboard.transactions.tsx",
    "src/routes/dashboard.customers.tsx",
    "src/routes/dashboard.products.tsx",
  ])("%s pagination navigates through URL search params", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/onPageChange=\{setPage\}/);
    expect(src).toMatch(/onPageChange=/);
  });
});

// ── Phase 4H: notification deep links ───────────────────────────────────────

describe("notification deep links", () => {
  it("payment/order notifications link to the exact order record", () => {
    const src = read("src/lib/notifications.ts");
    expect(src).toMatch(/targetUrl: `\/dashboard\/orders\?detail=\$\{orderId\}`/);
    expect(src.match(/targetUrl: `\/dashboard\/orders\?detail=/g)?.length).toBeGreaterThanOrEqual(
      4,
    );
  });

  it("top-nav navigates embedded query params and rejects foreign origins", () => {
    const src = read("src/components/dashboard/top-nav.tsx");
    expect(src).toContain("adminNavigationTarget(notif.target_url)");
    expect(src).not.toContain("navigate({ to: notif.target_url })");
  });
});

// ── Phase 4I/4J: actor + payment display integrity ──────────────────────────

describe("session actor and payment details", () => {
  it("security event writers resolve authoritative actor metadata", () => {
    const ops = read("src/lib/admin/admin-ops.server.ts");
    expect(ops).toMatch(/resolveAuditActor/);
    expect(ops).toMatch(/display_name: actor\.displayName/);
    expect(ops).not.toMatch(/\.split\("@"\)\[0\]/);

    const fns = read("src/lib/admin/server-fns.ts");
    expect(fns).toMatch(/resolveAuditActor\(db, userId\)/);
    expect(fns).toMatch(/safeMetadata\.display_name = actor\.displayName/);
  });

  it("payment details never fabricate historical provider values", () => {
    const src = read("src/routes/dashboard.transactions.$id.tsx");
    expect(src).toMatch(/txn\.paystack_reference \|\| "Not recorded"/);
    expect(src).toMatch(/txn\.currency \|\| "Not recorded"/);
    expect(src).toMatch(/Customer Email/);
  });

  it("money formatting stays pinned to en-NG", () => {
    for (const file of [
      "src/routes/dashboard.orders.tsx",
      "src/routes/dashboard.transactions.tsx",
      "src/routes/dashboard.transactions.$id.tsx",
    ]) {
      const src = read(file);
      expect(src).toMatch(/toLocaleString\("en-NG"\)/);
      expect(src).not.toMatch(/toLocaleString\(\)/);
    }
  });
});
