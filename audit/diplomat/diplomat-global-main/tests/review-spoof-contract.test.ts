import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reviewSchema } from "../src/lib/reviews.server";

/**
 * Verified-purchase exploitability contract (Owner audit §8/§6).
 *
 * Current model: verified_purchase is derived server-side from a paid order +
 * order_items match for the customer record matching the SUBMITTED EMAIL.
 * Identity is therefore email-claim based, not authenticated-identity based.
 *
 * These tests pin what IS true today:
 *  - the browser can never submit a verified flag (schema has no such field),
 *  - verification logic runs server-side only,
 * and document the remaining spoof risk for the future migration.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const reviewSource = fs.readFileSync(path.join(here, "../src/lib/reviews.server.ts"), "utf8");

describe("verified purchase — browser cannot control verification", () => {
  it("validator schema exposes no verified/verifiedPurchase/is_verified field", () => {
    const verdict = reviewSchema.safeParse({
      product_id: "test-product-id",
      rating: 5,
      customer_name: "Ada Obi",
      customer_email: "ada@example.com",
      body: "A genuinely helpful review that is long enough to pass validation.",
      // Attacker attempts:
      verified: true,
      verifiedPurchase: true,
      is_verified: true,
      verified_purchase: true,
      customer_id: "victim-customer-id",
    });
    expect(verdict.success).toBe(true);
    // The accepted payload carries none of the injected privilege fields.
    const accepted = verdict.success ? verdict.data : {};
    expect(accepted).not.toHaveProperty("verified");
    expect(accepted).not.toHaveProperty("verifiedPurchase");
    expect(accepted).not.toHaveProperty("is_verified");
    expect(accepted).not.toHaveProperty("verified_purchase");
    expect(accepted).not.toHaveProperty("customer_id");
  });

  it("verification is computed server-side, never read from request data", () => {
    // The insert sets verified_purchase: true only after the paid-order lookup.
    const insertBlock =
      /\.insert\(\{[\s\S]*?verified_purchase: true,/.exec(reviewSource)?.[0] ?? "";
    expect(insertBlock).toContain("verified_purchase: true");
    // And the paid/fulfilled order gate exists before it.
    const orderGate =
      /from\("orders"\)[\s\S]*?status.*paid[\s\S]*?delivered/.exec(reviewSource)?.[0] ?? "";
    expect(orderGate).toMatch(/paid/);
    expect(orderGate).toMatch(/delivered/);
  });
});

describe("verified purchase — documented residual spoof risk", () => {
  it("identity linkage is email-claim based (no session check in submit path)", () => {
    // Documents the gap honestly: any caller who knows a purchaser's email
    // can obtain that customer's verified-review privilege. Full proof
    // requires authenticated customer identity linkage (future migration —
    // Owner approval required; no schema change made in this phase).
    expect(reviewSource).toMatch(/customer_email/);
    expect(reviewSource).not.toMatch(/getAuth\(\)|\.getUserId\(\)|auth\(\)/);
  });

  it("duplicate abuse is rate-limited and idempotent per customer+product", () => {
    expect(reviewSource).toMatch(/checkRateLimit/);
    expect(reviewSource).toMatch(/You have already reviewed this product\./);
  });
});
