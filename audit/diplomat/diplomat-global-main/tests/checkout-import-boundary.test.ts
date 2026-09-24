import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression contract for the checkout dev-compilation blocker.
 *
 * checkout.server.ts is a client-reachable serverFn (RPC-bridge) module.
 * TanStack Start's dev import-protection rejected its former static import of
 * payment-rollout.server.ts, making the /checkout route chunk return 500 in
 * dev and blocking all local checkout/receipt runtime QA.
 *
 * The fix inlines the 3-line v1 creation gate (the only thing it needed) using
 * constants already imported from the neutral checkout-quote module.
 *
 * NOTE: some `.server` modules ARE safe to import here (rate-limit.server,
 * checkout-products.server are long-standing precedents that compile in dev),
 * so the boundary cannot be generalized to "no .server imports". Instead the
 * known-safe set is pinned: any NEW relative import must be verified against
 * dev import-protection before being added.
 */

const checkoutServerPath = resolve(__dirname, "../src/lib/checkout.server.ts");
const source = readFileSync(checkoutServerPath, "utf8");

/** Proven to compile through TanStack dev import-protection from this module. */
const KNOWN_SAFE_IMPORTS = new Set([
  "./rate-limit.server",
  "./checkout-quote",
  "./coupon-lifecycle",
  "./checkout-products.server",
]);

function relativeStaticImports(src: string): string[] {
  return [...src.matchAll(/import\s+(?:type\s+)?[^'"]*from\s+["']([^"']+)["']/g)]
    .map((m) => m[1])
    .filter((p) => p.startsWith("."));
}

describe("checkout serverFn import boundary", () => {
  it("imports only modules proven safe under TanStack dev import-protection", () => {
    const imports = relativeStaticImports(source);
    const unproven = imports.filter((p) => !KNOWN_SAFE_IMPORTS.has(p));
    expect(unproven).toEqual([]);
  });

  it("does not import payment-rollout.server (static or dynamic)", () => {
    // Strip comments so the filename may safely appear in prose documentation.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code.includes("payment-rollout.server")).toBe(false);
  });

  it("inlines the v1 gate exactly as payment-rollout.server.ts defines it", () => {
    const rollout = readFileSync(
      resolve(__dirname, "../src/lib/payment-rollout.server.ts"),
      "utf8",
    );
    // Same env name and same version constant on both sides — no second
    // feature-flag interpretation may drift from the canonical rollout gate.
    expect(source).toContain('process.env.PAYMENT_FINANCIAL_FINALIZATION_V1_ENABLED === "true"');
    expect(rollout).toContain('process.env.PAYMENT_FINANCIAL_FINALIZATION_V1_ENABLED === "true"');
    expect(source).toContain("FINANCIAL_FINALIZATION_VERSION");
    // The gate comment documents why it is inlined (must not be lost).
    expect(source).toContain("dev import-protection");
  });

  it("does not leak server-only env values through the metadata gate", () => {
    // Only the version marker is stamped from the gate — never raw env values.
    const gateStart = source.indexOf('PAYMENT_FINANCIAL_FINALIZATION_V1_ENABLED === "true"');
    const gateRegion = source.slice(gateStart, gateStart + 220);
    expect(gateRegion).toContain("financial_finalization_version: FINANCIAL_FINALIZATION_VERSION");
    expect(gateRegion).not.toMatch(/process\.env\.[A-Z_]+\s*[,}]/);
  });
});
