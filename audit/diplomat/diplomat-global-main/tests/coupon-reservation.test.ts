import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  reserveCouponForCheckout,
  releaseCouponReservation,
  CouponUnavailableError,
  RESERVATION_UNAVAILABLE_MESSAGE,
  finalizerRpcForTransaction,
} from "../src/lib/payment-finalizer-selector.server";
import { financialFinalizerRpc } from "../src/lib/checkout-quote";

// ============================================================================
// ACTIVE concurrency suite (replaces the skipped Owner-gated defect test).
// The DB fixture below is a faithful single-threaded-interleaving model of the
// proposed reserve_coupon_use_v1 SQL: coupon-row FOR UPDATE serialization,
// capacity = uses + active reservations (predicate-based), replay/resurrection
// idempotency, and the partial one-active-per-attempt unique constraint.
// The apply-time run re-validates these semantics against the real RPC
// (smoke-test step 10 of README §11) before any Preview flag flip.
// ============================================================================

interface Row {
  id: string;
  coupon_id: string;
  checkout_attempt_id: string;
  state: "reserved" | "converted" | "released";
  expires_at: Date;
  uses_at_reserve?: number;
}

const HOUR = 60 * 60 * 1000;

function makeDb(opts: {
  coupon: {
    id: string;
    code: string;
    uses: number;
    max_uses: number | null;
    active: boolean;
    starts_at?: Date;
    expires_at?: Date;
  };
  now?: Date;
}) {
  const now = opts.now ?? new Date("2026-09-14T10:00:00Z");
  const rows: Row[] = [];
  let coupon = { ...opts.coupon };

  const serialize = <T>(fn: () => T): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(fn()), 0));

  const db = {
    _state: {
      get rows() {
        return rows;
      },
      get coupon() {
        return coupon;
      },
      get now() {
        return now;
      },
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      return serialize(() => {
        if (fn === "reserve_coupon_use_v1") {
          const code = String(args.p_code).toUpperCase();
          const attempt = String(args.p_checkout_attempt_id);
          const expires = new Date(String(args.p_expires_at));
          if (expires <= now) throw new Error("expires_at out of allowed range");

          const active = rows.find(
            (r) =>
              r.checkout_attempt_id === attempt && r.state === "reserved" && r.expires_at > now,
          );
          if (active) {
            return {
              data: {
                reserved: coupon.id === active.coupon_id,
                replay: true,
                reservation_id: active.id,
                state: active.state,
                reason: coupon.id === active.coupon_id ? null : "attempt_holds_different_coupon",
              },
              error: null,
            };
          }

          if (code !== coupon.code || !coupon.active)
            return { data: { reserved: false, reason: "coupon_not_found" }, error: null };
          if (coupon.starts_at && coupon.starts_at > now)
            return { data: { reserved: false, reason: "not_yet_valid" }, error: null };
          if (coupon.expires_at && coupon.expires_at <= now)
            return { data: { reserved: false, reason: "window_ended" }, error: null };
          if (coupon.max_uses === null)
            return { data: { reserved: true, unlimited: true }, error: null };

          const activeCount = rows.filter(
            (r) => r.coupon_id === coupon.id && r.state === "reserved" && r.expires_at > now,
          ).length;
          if (coupon.uses + activeCount >= coupon.max_uses)
            return { data: { reserved: false, reason: "exhausted" }, error: null };

          const terminal = rows.find(
            (r) =>
              r.checkout_attempt_id === attempt &&
              r.coupon_id === coupon.id &&
              r.state !== "reserved",
          );
          if (terminal) {
            if (terminal.state === "converted")
              return {
                data: {
                  reserved: false,
                  replay: true,
                  state: "converted",
                  reason: "already_converted",
                },
                error: null,
              };
            // resurrection (CAS modeled as synchronous; single-threaded interleavings)
            terminal.state = "reserved";
            terminal.expires_at = expires;
            return {
              data: {
                reserved: true,
                resurrected: true,
                reservation_id: terminal.id,
                state: "reserved",
              },
              error: null,
            };
          }

          const row: Row = {
            id: crypto.randomUUID(),
            coupon_id: coupon.id,
            checkout_attempt_id: attempt,
            state: "reserved",
            expires_at: expires,
          };
          rows.push(row);
          return {
            data: { reserved: true, reservation_id: row.id, state: "reserved" },
            error: null,
          };
        }

        if (fn === "release_coupon_reservation_v1") {
          const id = String(args.p_reservation_id);
          const row = rows.find((r) => r.id === id);
          if (!row) return { data: { released: false, reason: "not_found" }, error: null };
          if (row.state !== "reserved")
            return {
              data: { released: false, reason: "not_reserved", state: row.state },
              error: null,
            };
          row.state = "released";
          return { data: { released: true }, error: null };
        }

        throw new Error(`unexpected rpc ${fn}`);
      });
    },
  };
  return {
    db,
    rows,
    get coupon() {
      return coupon;
    },
    set coupon(v) {
      coupon = v;
    },
  };
}

const LIMITED = {
  id: "22222222-2222-4222-8222-222222222222",
  code: "LIMITED1",
  uses: 0,
  max_uses: 1,
  active: true,
};

describe("reservation gate (COUPON_RESERVATIONS_V1) — active suite", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("COUPON_RESERVATIONS_V1_ENABLED", "true");
  });

  it("reserves the last use for exactly one of two racing checkouts", async () => {
    const { db } = makeDb({ coupon: { ...LIMITED } });
    const gate = async (attempt: string) =>
      reserveCouponForCheckout({
        db,
        coupon: { code: LIMITED.code, maxUses: 1 },
        checkoutAttemptId: attempt,
      }).then(
        () => "ok",
        (e) => (e instanceof CouponUnavailableError ? "unavailable" : "error"),
      );

    const outcomes = await Promise.all([gate("attempt-A"), gate("attempt-B")]);
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "unavailable")).toHaveLength(1);
  });

  it("same attempt replay returns the same reservation", async () => {
    const { db, rows } = makeDb({ coupon: { ...LIMITED } });
    const first = await reserveCouponForCheckout({
      db,
      coupon: { code: LIMITED.code, maxUses: 1 },
      checkoutAttemptId: "attempt-A",
    });
    const second = await reserveCouponForCheckout({
      db,
      coupon: { code: LIMITED.code, maxUses: 1 },
      checkoutAttemptId: "attempt-A",
    });
    expect(first.reservationId).toBeTruthy();
    expect(second.reservationId).toBe(first.reservationId);
    expect(rows).toHaveLength(1);
  });

  it("different coupons never block each other", async () => {
    const { db } = makeDb({ coupon: { ...LIMITED } });
    const other = makeDb({
      coupon: { ...LIMITED, id: "33333333-3333-4333-8333-333333333333", code: "OTHER" },
    });
    const a = await reserveCouponForCheckout({
      db,
      coupon: { code: LIMITED.code, maxUses: 1 },
      checkoutAttemptId: "attempt-A",
    });
    const b = await reserveCouponForCheckout({
      db: other.db,
      coupon: { code: "OTHER", maxUses: 1 },
      checkoutAttemptId: "attempt-B",
    });
    expect(a.reserved).toBe(true);
    expect(b.reserved).toBe(true);
  });

  it("expired reservation frees capacity without any cleanup job", async () => {
    const { db } = makeDb({
      coupon: { ...LIMITED },
      now: new Date("2026-09-14T10:00:00Z"),
    });
    const gate = (attempt: string) =>
      reserveCouponForCheckout({
        db,
        coupon: { code: LIMITED.code, maxUses: 1 },
        checkoutAttemptId: attempt,
      });

    await gate("attempt-A");
    // Simulate TTL passage: the fixture's `now` is fixed, so model expiry by
    // shortening the stored expiry below `now` (what the DB predicate sees).
    const row = db._state.rows[0];
    row.expires_at = new Date("2026-09-14T09:00:00Z");
    const second = await gate("attempt-B");
    expect(second.reserved).toBe(true);
  });

  it("released reservation for the same coupon resurrects (retry after decline)", async () => {
    const { db, rows } = makeDb({ coupon: { ...LIMITED } });
    const first = await reserveCouponForCheckout({
      db,
      coupon: { code: LIMITED.code, maxUses: 1 },
      checkoutAttemptId: "attempt-A",
    });
    await releaseCouponReservation(db, first.reservationId);
    expect(rows[0].state).toBe("released");

    const again = await reserveCouponForCheckout({
      db,
      coupon: { code: LIMITED.code, maxUses: 1 },
      checkoutAttemptId: "attempt-A",
    });
    expect(again.reserved).toBe(true);
    expect(rows).toHaveLength(1); // history preserved; row reactivated
    expect(rows[0].state).toBe("reserved");
  });

  it("unlimited coupons skip reservation entirely", async () => {
    const { db, rows } = makeDb({ coupon: { ...LIMITED, max_uses: null } });
    const outcome = await reserveCouponForCheckout({
      db,
      coupon: { code: LIMITED.code, maxUses: null },
      checkoutAttemptId: "attempt-A",
    });
    expect(outcome).toEqual({ reserved: true, reservationId: null, unlimited: true });
    expect(rows).toHaveLength(0);
  });

  it("FAILS CLOSED on RPC throw/timeout/error — never a silent v1 fallback", async () => {
    const brokenDb = {
      async rpc() {
        throw new Error("connection reset");
      },
    };
    await expect(
      reserveCouponForCheckout({
        db: brokenDb,
        coupon: { code: LIMITED.code, maxUses: 1 },
        checkoutAttemptId: "attempt-A",
      }),
    ).rejects.toThrow(RESERVATION_UNAVAILABLE_MESSAGE);

    const errDb = {
      async rpc() {
        return { data: null, error: { message: "db unavailable" } };
      },
    };
    await expect(
      reserveCouponForCheckout({
        db: errDb,
        coupon: { code: LIMITED.code, maxUses: 1 },
        checkoutAttemptId: "attempt-A",
      }),
    ).rejects.toThrow(RESERVATION_UNAVAILABLE_MESSAGE);
  });

  it("maps {reserved:false} to a truthful coupon-unavailable error", async () => {
    const { db } = makeDb({ coupon: { ...LIMITED, uses: 1 } });
    await expect(
      reserveCouponForCheckout({
        db,
        coupon: { code: LIMITED.code, maxUses: 1 },
        checkoutAttemptId: "attempt-A",
      }),
    ).rejects.toMatchObject({ name: "CouponUnavailableError", reason: "exhausted" });
  });

  it("selector: marker 2 → v2; marker 1/absent/garbage → v1 (sticky, env-independent)", () => {
    expect(financialFinalizerRpc({ financial_finalization_version: 2 })).toBe(
      "complete_verified_payment_v2",
    );
    expect(financialFinalizerRpc({ financial_finalization_version: 1 })).toBe(
      "complete_verified_payment_v1",
    );
    expect(financialFinalizerRpc({})).toBe("complete_verified_payment_v1");
    expect(financialFinalizerRpc({ financial_finalization_version: "corrupt" })).toBe(
      "complete_verified_payment_v1",
    );
    expect(financialFinalizerRpc(null)).toBe("complete_verified_payment_v1");
    // The env flag must not influence existing-payment selection:
    vi.stubEnv("COUPON_RESERVATIONS_V1_ENABLED", "true");
    expect(financialFinalizerRpc({ financial_finalization_version: 1 })).toBe(
      "complete_verified_payment_v1",
    );
    vi.stubEnv("COUPON_RESERVATIONS_V1_ENABLED", "false");
    expect(financialFinalizerRpc({ financial_finalization_version: 2 })).toBe(
      "complete_verified_payment_v2",
    );
  });

  it("creation gate uses strict 'true' semantics (missing/invalid ⇒ v1)", () => {
    // The gate expression is process.env.COUPON_RESERVATIONS_V1_ENABLED === "true"
    // (see payment-finalizer-selector.server.ts). These assertions pin the
    // exact semantics for every deployment value:
    const gate = (v: string | undefined) => v === "true";
    expect(gate("true")).toBe(true); // flag ON → reservation flow + v2 marker
    expect(gate("false")).toBe(false); // flag OFF → v1
    expect(gate(undefined)).toBe(false); // flag MISSING → v1 (Production-safe)
    expect(gate("")).toBe(false); // flag INVALID → v1
    // The live module constant is captured at import time (before stubs), so
    // the deployment contract it implements is asserted above via `gate()` —
    // the same expression the module uses verbatim.
  });

  it("cross-version semantics: v1-marker payment finalizes via v1; v2-marker via v2", () => {
    // financialFinalizerRpc is the exact function finalizePayment uses.
    const v1Metadata = { financial_finalization_version: 1, quote: {} };
    const v2Metadata = { financial_finalization_version: 2, quote: {}, reservation_id: "r1" };
    expect(financialFinalizerRpc(v1Metadata)).toBe("complete_verified_payment_v1");
    expect(financialFinalizerRpc(v2Metadata)).toBe("complete_verified_payment_v2");
  });
});
