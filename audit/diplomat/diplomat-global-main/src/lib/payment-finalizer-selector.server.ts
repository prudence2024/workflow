import "@tanstack/react-start/server-only";
import { isFinancialFinalizationV2 } from "./checkout-quote";

/**
 * Reservation-aware checkout gate (COUPON_RESERVATIONS_V1).
 *
 * The environment flag decides ONLY which protocol NEW checkouts start under.
 * Once a payment attempt exists, its stored metadata marker
 * (financial_finalization_version) is authoritative forever — see
 * financialFinalizerRpc() in checkout-quote.ts. The browser can never select
 * the financial mode: no payload field, query param, header, or cookie
 * participates in this decision.
 *
 * FLAG=true  → new limited-coupon checkouts reserve capacity first and stamp
 *              financial_finalization_version=2 (finalized by
 *              complete_verified_payment_v2).
 * FLAG=false → byte-identical legacy behaviour: no reservation, marker stays
 *              v1/absent, finalized by complete_verified_payment_v1.
 * FLAG missing/invalid → false (Production-safe default).
 */
export const COUPON_RESERVATIONS_ENABLED = process.env.COUPON_RESERVATIONS_V1_ENABLED === "true";

export interface CouponReservationOutcome {
  reserved: true;
  reservationId: string | null;
  unlimited: boolean;
}

/** Minimal RPC executor shape — satisfied by the Supabase client and test doubles. */
type ReserveFn = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * Atomically reserve one use of a LIMITED coupon for this checkout attempt.
 *
 * FAIL-CLOSED contract: ANY failure (throw, timeout, DB/network error,
 * {reserved:false} for any reason, malformed result) rejects checkout
 * initialization. The caller must NOT initialize Paystack with a discounted
 * quote when reservation capacity could not be secured — that would recreate
 * the two-checkout race this feature exists to prevent.
 *
 * Unlimited coupons never reserve (documented no-reservation path) and return
 * success without touching the RPC.
 *
 * TTL: 30 minutes — matches CHECKOUT_ATTEMPT_TTL_MS; the reservation stops
 * consuming capacity at expiry via the DB predicate, even if never released.
 */
export async function reserveCouponForCheckout(input: {
  db: { rpc: ReserveFn };
  coupon: { code: string; maxUses: number | null };
  checkoutAttemptId: string;
}): Promise<CouponReservationOutcome> {
  if (input.coupon.maxUses === null) {
    // Unlimited: no capacity invariant → no reservation, no contention.
    return { reserved: true, reservationId: null, unlimited: true };
  }

  const ttlMs = 30 * 60 * 1000; // CHECKOUT_ATTEMPT_TTL_MS
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  let result: { data: unknown; error: { message: string } | null };
  try {
    const call = input.db.rpc("reserve_coupon_use_v1", {
      p_code: input.coupon.code,
      p_checkout_attempt_id: input.checkoutAttemptId,
      p_expires_at: expiresAt,
    });
    result = await Promise.resolve(call).then((r) => ({
      data: (r as { data: unknown }).data,
      error: (r as { error: { message: string } | null }).error,
    }));
  } catch {
    throw new Error(RESERVATION_UNAVAILABLE_MESSAGE);
  }
  if (result.error) throw new Error(RESERVATION_UNAVAILABLE_MESSAGE);

  const data = result.data as {
    reserved?: boolean;
    reason?: string;
    reservation_id?: string;
    unlimited?: boolean;
  } | null;
  if (!data || data.reserved !== true) {
    // Capacity genuinely unavailable (exhausted, window ended, coupon gone…).
    // Truthful reason — distinct from an infrastructure failure.
    throw new CouponUnavailableError(data?.reason ?? "unavailable");
  }
  if (data.unlimited === true) return { reserved: true, reservationId: null, unlimited: true };
  return {
    reserved: true,
    reservationId: typeof data.reservation_id === "string" ? data.reservation_id : null,
    unlimited: false,
  };
}

export class CouponUnavailableError extends Error {
  constructor(public reason: string) {
    super("Coupon is no longer available.");
    this.name = "CouponUnavailableError";
  }
}

export const RESERVATION_UNAVAILABLE_MESSAGE =
  "We couldn't secure your coupon just now. Your details are saved — please retry payment in a moment.";

/** Authoritative release: only definitive provider verdicts may call this. */
export async function releaseCouponReservation(
  db: { rpc: ReserveFn },
  reservationId: string | null,
): Promise<void> {
  if (!reservationId) return; // unlimited path / no reservation row
  try {
    await Promise.resolve(
      db.rpc("release_coupon_reservation_v1", { p_reservation_id: reservationId }),
    );
  } catch {
    // Release is best-effort: on failure the TTL predicate frees capacity at
    // expiry regardless. Never block the customer-facing outcome on release.
  }
}

/**
 * Finalizer RPC name for an EXISTING payment — reads the authoritative DB
 * marker only. Kept here so both callback and webhook share one code path.
 */
export function finalizerRpcForTransaction(metadata: unknown): string {
  return isFinancialFinalizationV2(metadata)
    ? "complete_verified_payment_v2"
    : "complete_verified_payment_v1";
}
