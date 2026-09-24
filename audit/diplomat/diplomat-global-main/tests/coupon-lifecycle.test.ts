import { describe, expect, it, vi } from "vitest";
import {
  consumeCouponUseAtomic,
  confirmCouponMutation,
  couponCodesEquivalent,
  createCouponRecord,
  formatCouponExpiry,
  getCouponState,
  isCouponExhausted,
  loadCouponPage,
  normalizeCouponCode,
  normalizeCouponDateRange,
  shouldConsumeCouponForFinalization,
  type CouponDatabaseResult,
  type CouponRow,
  type CouponUseSnapshot,
} from "../src/lib/coupon-lifecycle";

function result<T>(data: T): CouponDatabaseResult<T> {
  return { data, error: null };
}

const baseCoupon: CouponRow = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "SAVE10",
  discount_type: "percentage",
  discount_value: 10,
  max_uses: 1,
  uses: 0,
  starts_at: null,
  expires_at: null,
  active: true,
};

describe("coupon creation invariants", () => {
  it("normalizes whitespace/case and defaults max uses to one", async () => {
    const insert = vi.fn(async (coupon) => result({ ...baseCoupon, ...coupon }));
    const created = await createCouponRecord(
      { code: "  save10  ", discount_type: "percentage", discount_value: 10 },
      async () => result([]),
      insert,
    );

    expect(normalizeCouponCode("  save10  ")).toBe("SAVE10");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ code: "SAVE10", max_uses: 1 }));
    expect(created).toMatchObject({ ok: true, coupon: { code: "SAVE10", max_uses: 1 } });
  });

  it.each(["SAVE10", "save10", "  SaVe10  "])(
    "rejects the equivalent duplicate %j without inserting",
    async (existingCode) => {
      const insert = vi.fn();
      const created = await createCouponRecord(
        { code: " SAVE10 ", discount_type: "fixed", discount_value: 500 },
        async () => result([{ id: baseCoupon.id, code: existingCode }]),
        insert,
      );

      expect(couponCodesEquivalent(existingCode, "SAVE10")).toBe(true);
      expect(created).toEqual({ ok: false, message: "A coupon with this code already exists." });
      expect(insert).not.toHaveBeenCalled();
    },
  );

  it("does not report success when uniqueness or affected-row proof fails", async () => {
    const uniquenessFailure = await createCouponRecord(
      { code: "SAVE10", discount_type: "percentage", discount_value: 10 },
      async () => ({ data: null, error: { message: "database offline" } }),
      vi.fn(),
    );
    const missingRow = await createCouponRecord(
      { code: "SAVE10", discount_type: "percentage", discount_value: 10 },
      async () => result([]),
      async () => result(null),
    );

    expect(uniquenessFailure).toMatchObject({ ok: false });
    expect(missingRow).toEqual({ ok: false, message: "The coupon insert could not be confirmed." });
  });

  it("keeps date-only coupons active through the selected expiry day", () => {
    expect(normalizeCouponDateRange({ starts_at: "2026-09-02", expires_at: "2026-09-02" })).toEqual(
      {
        starts_at: "2026-09-02T00:00:00.000+01:00",
        expires_at: "2026-09-02T23:59:59.999+01:00",
        valid: true,
      },
    );
  });

  it("honours the business calendar (Africa/Lagos), not the UTC day", () => {
    const range = normalizeCouponDateRange({ starts_at: "2026-09-14", expires_at: "2026-09-30" });
    // Local business midnight on the start day is 23:00Z the previous UTC day —
    // so a coupon configured to start today is valid during the local morning.
    expect(new Date(range.starts_at!).toISOString()).toBe("2026-09-13T23:00:00.000Z");
    // 23:59:59.999+01:00 is 22:59:59.999Z on the same UTC calendar day.
    expect(new Date(range.expires_at!).toISOString()).toBe("2026-09-30T22:59:59.999Z");
    // Same-day start+expiry spans exactly one full local business day.
    expect(range.valid).toBe(true);
  });

  it("keeps database list failures distinct from an empty coupon list", async () => {
    const failed = await loadCouponPage({}, async () => ({
      data: null,
      count: null,
      error: { message: "database offline" },
    }));
    const empty = await loadCouponPage({}, async () => ({ data: [], count: 0, error: null }));

    expect(failed).toMatchObject({ ok: false, coupons: [], message: expect.any(String) });
    expect(empty).toMatchObject({ ok: true, coupons: [], total: 0 });
  });

  it("requires an affected row for update and delete success", () => {
    expect(confirmCouponMutation("update", result(null))).toEqual({
      ok: false,
      message: "Coupon not found.",
    });
    expect(confirmCouponMutation("delete", result(null))).toEqual({
      ok: false,
      message: "Coupon not found.",
    });
    expect(confirmCouponMutation("update", result(baseCoupon))).toMatchObject({ ok: true });
  });
});

describe("coupon availability", () => {
  it("keeps disabled, expired, and exhausted as distinct states", () => {
    const now = new Date("2026-09-02T12:00:00.000Z");
    expect(getCouponState({ ...baseCoupon, active: false }, now)).toBe("disabled");
    expect(getCouponState({ ...baseCoupon, expires_at: "2026-09-01T00:00:00.000Z" }, now)).toBe(
      "expired",
    );
    expect(getCouponState({ ...baseCoupon, uses: 1 }, now)).toBe("exhausted");
    expect(getCouponState(baseCoupon, now)).toBe("active");
    expect(isCouponExhausted({ ...baseCoupon, active: false, uses: 1 })).toBe(true);
  });

  it("formats the complete expiry date including a four-digit year", () => {
    expect(formatCouponExpiry("2027-12-31T00:00:00.000Z")).toMatch(/2027/);
    expect(formatCouponExpiry(null)).toBe("Never");
  });

  it.each([
    // [label, nowInstant, expected state]
    ["just before local start midnight", "2026-09-13T22:59:59.999Z", "scheduled"],
    ["exactly local midnight (start day)", "2026-09-13T23:00:00.000Z", "active"],
    ["local morning of start day (DIPWM5P case)", "2026-09-14T08:00:00.000Z", "active"],
    ["just before next local midnight", "2026-09-14T22:59:59.998Z", "active"],
    ["exact stored expiry instant", "2026-09-14T22:59:59.999Z", "expired"],
    ["next local midnight (day after expiry)", "2026-09-14T23:00:00.000Z", "expired"],
  ] as const)("same-day coupon %s => %s", (_label, nowInstant, expected) => {
    const coupon: CouponRow = {
      ...baseCoupon,
      starts_at: "2026-09-14T00:00:00.000+01:00",
      expires_at: "2026-09-14T23:59:59.999+01:00",
    };
    expect(getCouponState(coupon, new Date(nowInstant))).toBe(expected);
  });

  it("keeps a multi-day coupon valid across the UTC/local crossover", () => {
    const coupon: CouponRow = {
      ...baseCoupon,
      starts_at: "2026-09-01T00:00:00.000+01:00",
      expires_at: "2026-09-30T23:59:59.999+01:00",
    };
    // 2026-09-30 23:30 Lagos (22:30Z, Sep 30 UTC) is still inside the window.
    expect(getCouponState(coupon, new Date("2026-09-30T22:30:00.000Z"))).toBe("active");
    // 2026-10-01 00:00 Lagos (23:00Z, still Sep 30 UTC) is expired.
    expect(getCouponState(coupon, new Date("2026-09-30T23:00:00.000Z"))).toBe("expired");
  });

  it("does not reinterpret legacy timestamp-based coupon values", () => {
    // A coupon stored with explicit UTC instants (legacy/admin-specified time)
    // keeps its absolute meaning: comparisons are instant-based, never re-sliced.
    const legacy: CouponRow = {
      ...baseCoupon,
      starts_at: "2026-09-14T09:00:00.000Z",
      expires_at: "2026-09-14T10:00:00.000Z",
    };
    expect(getCouponState(legacy, new Date("2026-09-14T08:59:59.999Z"))).toBe("scheduled");
    expect(getCouponState(legacy, new Date("2026-09-14T09:00:00.000Z"))).toBe("active");
    expect(getCouponState(legacy, new Date("2026-09-14T10:00:00.000Z"))).toBe("expired");
  });
});

describe("coupon final-use concurrency", () => {
  it("allows only the order-CAS winner to consume a coupon on retries", () => {
    expect(
      shouldConsumeCouponForFinalization({
        orderWasAlreadyPaid: false,
        orderClaimedByThisRequest: true,
      }),
    ).toBe(true);
    expect(
      shouldConsumeCouponForFinalization({
        orderWasAlreadyPaid: true,
        orderClaimedByThisRequest: false,
      }),
    ).toBe(false);
    expect(
      shouldConsumeCouponForFinalization({
        orderWasAlreadyPaid: false,
        orderClaimedByThisRequest: false,
      }),
    ).toBe(false);
  });
  it("permits exactly one winner for the last use and never exceeds max_uses", async () => {
    let stored: CouponUseSnapshot = { uses: 0, max_uses: 1 };
    const load = async () => {
      const snapshot = { ...stored };
      await Promise.resolve();
      return result(snapshot);
    };
    const compareAndSwap = async ({ expectedUses, nextUses, maxUses }) => {
      await Promise.resolve();
      if (stored.uses !== expectedUses || (maxUses !== null && stored.uses >= maxUses)) {
        return result<CouponUseSnapshot>(null);
      }
      stored = { ...stored, uses: nextUses };
      return result({ ...stored });
    };

    const outcomes = await Promise.all([
      consumeCouponUseAtomic(load, compareAndSwap),
      consumeCouponUseAtomic(load, compareAndSwap),
    ]);

    expect(outcomes.filter((outcome) => outcome.consumed)).toHaveLength(1);
    expect(stored).toEqual({ uses: 1, max_uses: 1 });
  });

  it("retries contention while preserving every available slot", async () => {
    let stored: CouponUseSnapshot = { uses: 0, max_uses: 3 };
    const load = async () => result({ ...stored });
    const compareAndSwap = async ({ expectedUses, nextUses, maxUses }) => {
      await Promise.resolve();
      if (stored.uses !== expectedUses || (maxUses !== null && stored.uses >= maxUses)) {
        return result<CouponUseSnapshot>(null);
      }
      stored = { ...stored, uses: nextUses };
      return result({ ...stored });
    };

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => consumeCouponUseAtomic(load, compareAndSwap)),
    );

    expect(outcomes.filter((outcome) => outcome.consumed)).toHaveLength(3);
    expect(stored.uses).toBe(3);
  });

  // The two-checkout last-use race defect (previously a skipped marker here)
  // is closed by the reservation architecture: see tests/coupon-reservation.test.ts
  // for the ACTIVE suite covering reserve/replay/race/release/resurrection.
  it("two racing limited-coupon checkouts cannot both secure the last use", async () => {
    // App-level guarantee via the reservation gate: reserve succeeds for one
    // attempt only; the other is refused BEFORE Paystack initialization.
    const { reserveCouponForCheckout, CouponUnavailableError } =
      await import("../src/lib/payment-finalizer-selector.server");
    let activeAttempt: string | null = null;
    const db = {
      async rpc(fn: string, args: Record<string, unknown>) {
        if (fn !== "reserve_coupon_use_v1") throw new Error("unexpected");
        const attempt = String(args.p_checkout_attempt_id);
        if (activeAttempt && activeAttempt !== attempt)
          return { data: { reserved: false, reason: "exhausted" }, error: null };
        activeAttempt = attempt;
        return { data: { reserved: true, reservation_id: "r1", state: "reserved" }, error: null };
      },
    };
    const gate = (attempt: string) =>
      reserveCouponForCheckout({
        db,
        coupon: { code: "LAST1", maxUses: 1 },
        checkoutAttemptId: attempt,
      }).then(
        () => "ok",
        (e) => (e instanceof CouponUnavailableError ? "refused" : "error"),
      );
    const outcomes = await Promise.all([gate("A"), gate("B")]);
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "refused")).toHaveLength(1);
  });
});
