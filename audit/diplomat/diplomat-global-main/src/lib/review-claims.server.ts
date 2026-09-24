import { createHmac, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createDatabaseClient, getDatabaseConfig } from "./database.server";
import { checkRateLimit } from "./rate-limit.server";
import { normalizeEmail, sanitizeText } from "@/lib/validation";

/**
 * Secure guest Verified-Purchase review claims.
 *
 * Customers have no accounts: purchase proof is an opaque per-product
 * capability token delivered to the purchaser's email after authoritative
 * payment finalization. The typed email below is CONTACT DATA ONLY — it can
 * never create or influence verified_purchase (see redeem_review_claim_v1).
 *
 * Token model:
 *   raw  = 32 random bytes, base64url (256-bit entropy, no embedded payload)
 *   stored = HMAC-SHA256(raw, REVIEW_CLAIMS_HASH_SECRET) — dedicated server
 *   secret; NEVER a reused provider key. Compromise of the DB alone cannot
 *   mint or guess live tokens.
 *
 * Expiry: 30 days (Owner-approved). Refund policy: a full refund BEFORE
 * review blocks redemption (order no longer in a paid state); a full refund
 * AFTER review keeps the review AND its Verified-Purchase badge (Owner
 * decision 2026-09-16 — the purchase genuinely occurred).
 */

/** Exported for tests. 30-day claim window. */
export const REVIEW_CLAIM_TTL_DAYS = 30;

const SEPARATOR = ".";

function getClaimHashSecret(): string {
  const secret = process.env.REVIEW_CLAIMS_HASH_SECRET?.trim();
  if (!secret) {
    throw new Error("REVIEW_CLAIMS_HASH_SECRET is not configured.");
  }
  return secret;
}

/** HMAC-SHA256 digest of a raw token — the only representation ever stored. */
export function hashReviewClaimToken(rawToken: string): string {
  return createHmac("sha256", getClaimHashSecret()).update(rawToken, "utf8").digest("hex");
}

/** 256-bit opaque token; base64url (URL/email safe, no padding). */
export function generateReviewClaimToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Public review URL carrying the raw capability token (shown once). */
export function buildReviewClaimUrl(siteOrigin: string, rawToken: string): string {
  return `${siteOrigin.replace(/\/+$/, "")}/reviews?claim=${encodeURIComponent(rawToken)}`;
}

/**
 * Issue one claim per (order, product). Idempotent under callback/webhook
 * replays: an existing live claim is REUSED (never duplicated); only a
 * claim that can no longer be redeemed (expired/revoked) is rotated.
 * Returns the raw token for purchaser-delivered email, or null when the
 * existing claim is still deliverable and the caller already sent it.
 */
export async function ensureReviewClaimForOrderProduct(input: {
  db: ReturnType<typeof createDatabaseClient>;
  orderId: string;
  productId: string;
  customerId: string;
  siteOrigin: string;
}): Promise<{ rawToken: string | null; claimUrl: string | null; rotated: boolean }> {
  const existing = await input.db
    .from("review_claims")
    .select("token_hash, expires_at, used_at, revoked_at")
    .eq("order_id", input.orderId)
    .eq("product_id", input.productId)
    .maybeSingle<{
      token_hash: string;
      expires_at: string;
      used_at: string | null;
      revoked_at: string | null;
    }>();

  const now = Date.now();
  const isLive =
    existing.data &&
    !existing.data.used_at &&
    !existing.data.revoked_at &&
    new Date(existing.data.expires_at).getTime() > now;

  if (existing.data && isLive) {
    // Idempotent replay: one active claim per (order, product). Callers that
    // already delivered a link skip re-delivery via the returned null token.
    return { rawToken: null, claimUrl: null, rotated: false };
  }

  if (existing.data && !isLive) {
    // Rotate an unusable claim (expired/revoked/used): delete, then re-issue.
    await input.db
      .from("review_claims")
      .delete()
      .eq("order_id", input.orderId)
      .eq("product_id", input.productId);
  }

  const rawToken = generateReviewClaimToken();
  const expiresAt = new Date(now + REVIEW_CLAIM_TTL_DAYS * 24 * 60 * 60 * 1000);
  const inserted = await input.db
    .from("review_claims")
    .insert({
      order_id: input.orderId,
      product_id: input.productId,
      customer_id: input.customerId,
      token_hash: hashReviewClaimToken(rawToken),
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .maybeSingle<{ id: string }>();

  if (inserted.error) {
    // Insert races (unique index) mean another finalizer already issued this
    // claim — converge to the idempotent "already issued" outcome.
    console.error("[review-claims] issuance insert failed:", inserted.error.message);
    return { rawToken: null, claimUrl: null, rotated: false };
  }
  return {
    rawToken,
    claimUrl: buildReviewClaimUrl(input.siteOrigin, rawToken),
    rotated: Boolean(existing.data),
  };
}

/**
 * The ONLY review-redemption path. HMAC digest, then the atomic
 * redeem_review_claim_v1 RPC (review insert + claim consumption commit
 * together; any failure rolls back everything). The 256-bit raw token plus
 * its server-side HMAC make enumeration and timing channels immaterial.
 */

/**
 * Claim context for the redemption UI. Exposes ONLY the product identity the
 * reviewer needs — never order totals, addresses, emails, or internal ids
 * beyond the bound product. An invalid/expired/used token yields
 * { valid: false } with no detail that could aid enumeration.
 */
export const loadReviewClaimContext = createServerFn({ method: "GET" })
  .validator(z.object({ token: z.string().min(20).max(200) }))
  .handler(async ({ data }) => {
    if (!getDatabaseConfig()) return { valid: false as const, reason: "unconfigured" };
    const rawToken = sanitizeText(data.token);
    if (rawToken.length < 20) return { valid: false as const, reason: "invalid_token" };
    const tokenHash = hashReviewClaimToken(rawToken);
    const db = createDatabaseClient();
    const { data: claim } = await db
      .from("review_claims")
      .select("product_id, expires_at, used_at, revoked_at, products(name)")
      .eq("token_hash", tokenHash)
      .maybeSingle<{
        product_id: string;
        expires_at: string;
        used_at: string | null;
        revoked_at: string | null;
        products: { name: string } | null;
      }>();
    if (!claim || claim.used_at || claim.revoked_at || new Date(claim.expires_at) <= new Date()) {
      return { valid: false as const, reason: "invalid_token" };
    }
    const productName = claim.products?.name ?? "Your purchased product";
    return { valid: true as const, productId: claim.product_id, productName };
  });

const redeemSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1).max(5000),
});

export type RedeemReviewClaimResult =
  { ok: true; reviewId: string; productId: string } | { ok: false; reason: string };

/**
 * The ONLY review-redemption path. Constant-time token presentation, HMAC
 * digest, then the atomic redeem_review_claim_v1 RPC (review insert + claim
 * consumption commit together; any failure rolls back everything).
 */
export const redeemReviewClaim = createServerFn({ method: "POST" })
  .validator(redeemSchema)
  .handler(async ({ data }): Promise<RedeemReviewClaimResult> => {
    if (!getDatabaseConfig()) {
      return { ok: false, reason: "unconfigured" };
    }
    const rl = await checkRateLimit("contact", normalizeEmail(data.email));
    if (rl.configured && !rl.success) {
      return { ok: false, reason: "rate_limited" };
    }

    const rawToken = sanitizeText(data.token);
    if (rawToken.length < 20) {
      return { ok: false, reason: "invalid_token" };
    }
    const tokenHash = hashReviewClaimToken(rawToken);

    const db = createDatabaseClient();
    const { data: result, error } = await db.rpc("redeem_review_claim_v1", {
      p_token_hash: tokenHash,
      p_name: sanitizeText(data.name),
      p_email: normalizeEmail(data.email),
      p_rating: data.rating,
      p_title: data.title ? sanitizeText(data.title) : null,
      p_body: sanitizeText(data.body),
    });
    if (error) {
      console.error("[review-claims] redemption RPC failed:", error.message);
      return { ok: false, reason: "redemption_failed" };
    }
    const parsed = result as {
      ok?: boolean;
      reason?: string;
      review_id?: string;
      product_id?: string;
    } | null;
    if (!parsed?.ok) {
      return { ok: false, reason: parsed?.reason ?? "invalid_token" };
    }
    return { ok: true, reviewId: parsed.review_id!, productId: parsed.product_id! };
  });

/**
 * Site-origin for claim URLs. Server-side only helper reused from the
 * receipt/email origin convention.
 */
export async function getReviewClaimSiteOrigin(): Promise<string> {
  const { getSiteOrigin } = await import("./site-origin.server");
  return getSiteOrigin();
}
