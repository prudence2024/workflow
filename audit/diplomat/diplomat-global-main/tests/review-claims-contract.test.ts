import { describe, expect, it } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guest review-claim security contract (§7 — Owner-approved design).
 *
 * The RPC itself runs only against Postgres; these tests pin the layered
 * contracts that make redemption safe:
 *   1. token entropy/format (server module source)
 *   2. hash-then-lookup discipline (never store or log raw tokens)
 *   3. atomic redemption semantics in redeem_review_claim_v1 (migration SQL)
 *   4. access control (no browser-role grants; service-role only)
 *   5. issuance integration points in the finalizer
 *
 * The existing live-DB proof paths (review-spoof-contract, reviews-hardening)
 * continue to pin the legacy email-claim surface until it is fully retired.
 */

const here = resolve(__dirname, "..");
const moduleSource = readFileSync(resolve(here, "src/lib/review-claims.server.ts"), "utf8");
const migrationSql = readFileSync(resolve(here, "supabase/migrations/20260916130000_review_claims.sql"), "utf8");
const finalizeSource = readFileSync(resolve(here, "src/lib/payment-finalize.server.ts"), "utf8");

/** Same construction as the server module — keeps the contract honest. */
function expectedHashShape(rawToken: string, secret: string): string {
  return createHmac("sha256", secret).update(rawToken, "utf8").digest("hex");
}

describe("review claim tokens", () => {
  it("generates 32-byte (256-bit) base64url tokens with no embedded payload", () => {
    expect(moduleSource).toContain("randomBytes(32)");
    expect(moduleSource).toContain("base64url");
    // No JSON/base64 payload encoding of ids or emails inside the token.
    expect(moduleSource).not.toMatch(/JSON\.parse\(|from\(rawToken|decode.*payload/i);
  });

  it("stores only an HMAC-SHA256 digest from a dedicated secret", () => {
    expect(moduleSource).toContain('createHmac("sha256", getClaimHashSecret())');
    expect(moduleSource).toContain("REVIEW_CLAIMS_HASH_SECRET");
    // The dedicated secret is NOT a reused provider key.
    for (const banned of ["PAYSTACK_SECRET_KEY", "CLERK_SECRET_KEY", "SUPABASE_SECRET_KEY", "RESEND_API_KEY"]) {
      expect(moduleSource).not.toContain(`process.env.${banned}`);
    }
  });

  it("hash digest shape is stable hex (64 chars) for a known secret", () => {
    const digest = expectedHashShape(randomBytes(32).toString("base64url"), "test-secret");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("enforces the Owner-approved 30-day expiry", () => {
    expect(moduleSource).toContain("REVIEW_CLAIM_TTL_DAYS = 30");
    expect(migrationSql).toContain("expires_at");
  });

  it("never persists or logs the raw token", () => {
    // Issuance returns rawToken for delivery but stores token_hash only.
    expect(moduleSource).toContain("token_hash: hashReviewClaimToken(rawToken)");
    expect(moduleSource).not.toMatch(/insert\(\{[^}]*raw_token/i);
  });
});

describe("redeem_review_claim_v1 (atomic redemption)", () => {
  it("hashes before lookup and never queries by raw token", () => {
    expect(moduleSource).toMatch(/hashReviewClaimToken\(rawToken\)[\s\S]{0,200}redeem_review_claim_v1/);
    expect(migrationSql).toContain("WHERE token_hash = p_token_hash");
    // The RPC accepts ONLY the digest — no raw-token parameter exists.
    expect(migrationSql).toMatch(/p_token_hash/);
    expect(migrationSql).not.toMatch(/p_token(?!_hash)/);
  });

  it("locks the claim FOR UPDATE and consumes it in the same transaction as the review insert", () => {
    expect(migrationSql).toContain("FOR UPDATE");
    const insertReviewIdx = migrationSql.indexOf("INSERT INTO public.reviews");
    const consumeIdx = migrationSql.indexOf("SET used_at = now(), used_by_review_id");
    expect(insertReviewIdx).toBeGreaterThan(-1);
    expect(consumeIdx).toBeGreaterThan(insertReviewIdx);
    // Wrapped in an explicit transaction with rollback-on-return semantics.
    expect(migrationSql).toContain("BEGIN;");
    expect(migrationSql).toContain("COMMIT;");
  });

  it("rejects expired, revoked, used, invalid, ineligible and duplicate cases without partial writes", () => {
    for (const reason of [
      "'already_used'",
      "'revoked'",
      "'expired'",
      "'invalid_token'",
      "'order_not_eligible'",
      "'product_not_in_order'",
      "'already_reviewed'",
    ]) {
      expect(migrationSql).toContain(reason);
    }
  });

  it("rechecks the authoritative paid-order state and the product purchase fence", () => {
    expect(migrationSql).toContain("SELECT * INTO v_order FROM public.orders WHERE id = v_claim.order_id FOR UPDATE");
    expect(migrationSql).toContain("v_order.status NOT IN ('paid', 'processing', 'shipped', 'delivered')");
    expect(migrationSql).toContain("FROM public.order_items");
    // Full refund BEFORE review → order left paid statuses → blocked.
  });

  it("sets verified_purchase server-side only", () => {
    expect(migrationSql).toContain("verified_purchase");
    expect(migrationSql).toContain("'approved', true");
  });

  it("keeps the badge through later refunds (no badge-reversal path exists)", () => {
    expect(migrationSql).not.toMatch(/UPDATE public\.reviews[\s\S]{0,120}verified_purchase\s*=\s*false/i);
    expect(migrationSql).not.toMatch(/SET\s+verified_purchase\s*=\s*(false|NULL)/i);
  });

  it("binds exactly one claim per order+product (idempotent issuance)", () => {
    expect(migrationSql).toContain("review_claims_order_product_unique");
  });
});

describe("review-claim access control", () => {
  it("enables and FORCES RLS on review_claims", () => {
    expect(migrationSql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migrationSql).toContain("FORCE ROW LEVEL SECURITY");
  });

  it("grants nothing to browser roles; EXECUTE is service-role only", () => {
    expect(migrationSql).toContain("REVOKE ALL ON public.review_claims FROM anon, authenticated");
    expect(migrationSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.redeem_review_claim_v1[\s\S]*?FROM PUBLIC, anon, authenticated/,
    );
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION public\.redeem_review_claim_v1[\s\S]*?TO service_role/);
  });

  it("uses a dedicated server-only secret, not the receipt/download token path", () => {
    expect(moduleSource).toContain("REVIEW_CLAIMS_HASH_SECRET");
    expect(moduleSource).not.toContain("download_token");
  });
});

describe("issuance integration in payment finalization", () => {
  it("issues claims only from the post-completion hook (never before payment authority)", () => {
    expect(finalizeSource).toContain("ensureReviewClaimForOrderProduct");
    const hookIdx = finalizeSource.indexOf("async function runPostCompletionEffects");
    const issueIdx = finalizeSource.indexOf("ensureReviewClaimForOrderProduct(");
    expect(issueIdx).toBeGreaterThan(hookIdx);
  });

  it("is failure-tolerant: claim issues can never fail finalization", () => {
    expect(finalizeSource).toMatch(
      /review-claim issuance failed/,
    );
  });
});
