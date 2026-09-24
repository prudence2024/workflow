export interface CouponRow {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_uses: number | null;
  uses: number;
  starts_at: string | null;
  expires_at: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CouponDatabaseError {
  message: string;
  code?: string;
}

export interface CouponDatabaseResult<T> {
  data: T | null;
  error: CouponDatabaseError | null;
  count?: number | null;
}

export interface CouponCreateInput {
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_uses?: number;
  starts_at?: string;
  expires_at?: string;
}

export type CouponCreateResult = { ok: true; coupon: CouponRow } | { ok: false; message: string };

export interface CouponPageInput {
  page?: number;
  pageSize?: number;
  search?: string;
}

export async function loadCouponPage(
  input: CouponPageInput,
  query: (normalized: Required<CouponPageInput>) => Promise<CouponDatabaseResult<CouponRow[]>>,
) {
  const normalized = {
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 10,
    search: input.search?.trim() ?? "",
  };
  const response = await query(normalized);
  if (response.error) {
    return {
      ok: false as const,
      coupons: [] as CouponRow[],
      total: 0,
      page: normalized.page,
      pageSize: normalized.pageSize,
      totalPages: 0,
      message: "Coupons could not be loaded. Please retry.",
    };
  }
  const total = response.count ?? response.data?.length ?? 0;
  return {
    ok: true as const,
    coupons: response.data ?? [],
    total,
    page: normalized.page,
    pageSize: normalized.pageSize,
    totalPages: Math.ceil(total / normalized.pageSize),
  };
}

export function confirmCouponMutation(
  action: "update" | "delete",
  response: CouponDatabaseResult<CouponRow>,
): CouponCreateResult {
  if (response.error) {
    return { ok: false, message: `Failed to ${action} coupon.` };
  }
  if (!response.data) return { ok: false, message: "Coupon not found." };
  return { ok: true, coupon: response.data };
}

export function normalizeCouponCode(value: string): string {
  return value.trim().toUpperCase();
}

export function couponCodesEquivalent(left: string, right: string): boolean {
  return normalizeCouponCode(left) === normalizeCouponCode(right);
}

/**
 * Date-only coupon boundaries follow the business calendar, not the UTC day.
 * Diplomat Global operates in Africa/Lagos (UTC+01:00, no DST). Storing raw
 * UTC day boundaries made a "starts today" coupon usable one local hour late
 * (00:00Z = 01:00 Lagos) and cut every expiry day one local hour short, so a
 * coupon configured to start the day it was created could be rejected during
 * the owner's own local morning. Storing an explicit +01:00 offset keeps the
 * stored instants correct regardless of server or viewer timezone. If the
 * business timezone ever changes, update this constant and new writes only —
 * stored instants remain absolute and remain honoured as-is.
 */
export const BUSINESS_UTC_OFFSET = "+01:00";

export function normalizeCouponDateRange(input: {
  starts_at?: string | null;
  expires_at?: string | null;
}) {
  // Inclusive from local business midnight on the start day; exclusive at the
  // following local midnight after the displayed expiry day (half-open
  // [start, nextDay) semantics — the displayed expiry day remains fully valid).
  const starts_at = input.starts_at
    ? `${input.starts_at.slice(0, 10)}T00:00:00.000${BUSINESS_UTC_OFFSET}`
    : null;
  const expires_at = input.expires_at
    ? `${input.expires_at.slice(0, 10)}T23:59:59.999${BUSINESS_UTC_OFFSET}`
    : null;
  return {
    starts_at,
    expires_at,
    valid: !starts_at || !expires_at || new Date(expires_at) > new Date(starts_at),
  };
}

function isDuplicateError(error: CouponDatabaseError): boolean {
  return error.code === "23505" || /duplicate|unique/i.test(error.message);
}

export async function createCouponRecord(
  input: CouponCreateInput,
  findCandidates: (
    normalizedCode: string,
  ) => Promise<CouponDatabaseResult<Pick<CouponRow, "id" | "code">[]>>,
  insert: (
    coupon: Omit<CouponRow, "id" | "created_at" | "updated_at">,
  ) => Promise<CouponDatabaseResult<CouponRow>>,
): Promise<CouponCreateResult> {
  const code = normalizeCouponCode(input.code);
  const dateRange = normalizeCouponDateRange(input);
  const candidates = await findCandidates(code);
  if (candidates.error) {
    return { ok: false, message: "Coupon uniqueness could not be verified. Please retry." };
  }
  if ((candidates.data ?? []).some((candidate) => couponCodesEquivalent(candidate.code, code))) {
    return { ok: false, message: "A coupon with this code already exists." };
  }

  const result = await insert({
    code,
    discount_type: input.discount_type,
    discount_value: input.discount_value,
    max_uses: input.max_uses ?? 1,
    uses: 0,
    starts_at: dateRange.starts_at,
    expires_at: dateRange.expires_at,
    active: true,
  });
  if (result.error) {
    return {
      ok: false,
      message: isDuplicateError(result.error)
        ? "A coupon with this code already exists."
        : "Failed to create coupon.",
    };
  }
  if (!result.data) {
    return { ok: false, message: "The coupon insert could not be confirmed." };
  }
  return { ok: true, coupon: result.data };
}

export type CouponState = "disabled" | "expired" | "scheduled" | "exhausted" | "active";

export function isCouponExhausted(coupon: CouponRow): boolean {
  return coupon.max_uses !== null && coupon.uses >= coupon.max_uses;
}

export function getCouponState(coupon: CouponRow, now = new Date()): CouponState {
  if (!coupon.active) return "disabled";
  // Half-open window [starts_at, expires_at): the expiry instant itself is
  // already expired, so a coupon is never usable in the same instant its
  // window closes.
  if (coupon.expires_at && new Date(coupon.expires_at) <= now) return "expired";
  if (coupon.starts_at && new Date(coupon.starts_at) > now) return "scheduled";
  if (isCouponExhausted(coupon)) return "exhausted";
  return "active";
}

export type CouponEvaluation =
  | {
      valid: true;
      couponId: string;
      code: string;
      discountType: CouponRow["discount_type"];
      discountValue: number;
      discount: number;
    }
  | { valid: false; message: string };

/** Canonical checkout coupon calculation for a server-loaded coupon row. */
export function evaluateCoupon(
  coupon: CouponRow | null,
  subtotal: number,
  now = new Date(),
): CouponEvaluation {
  if (!coupon) return { valid: false, message: "Coupon code not found." };

  const state = getCouponState(coupon, now);
  if (state === "disabled") {
    return { valid: false, message: "This coupon is not currently active." };
  }
  if (state === "scheduled") return { valid: false, message: "This coupon is not yet valid." };
  if (state === "expired") return { valid: false, message: "This coupon has expired." };
  if (state === "exhausted") {
    return { valid: false, message: "This coupon has reached its usage limit." };
  }

  const value = Number(coupon.discount_value);
  if (!Number.isFinite(value) || value <= 0) {
    return { valid: false, message: "This coupon does not apply to your order." };
  }
  if (coupon.discount_type === "percentage" && value > 100) {
    return { valid: false, message: "This coupon has an invalid percentage." };
  }

  const rawDiscount = coupon.discount_type === "percentage" ? subtotal * (value / 100) : value;
  const discount = Math.round(Math.min(rawDiscount, subtotal) * 100) / 100;
  if (discount <= 0) {
    return { valid: false, message: "This coupon does not apply to your order." };
  }

  return {
    valid: true,
    couponId: coupon.id,
    code: coupon.code,
    discountType: coupon.discount_type,
    discountValue: value,
    discount,
  };
}

export function formatCouponExpiry(value: string | null): string {
  if (!value) return "Never";
  // Business-day display: an Africa/Lagos end-of-day instant (22:59:59.999Z)
  // and a legacy UTC end-of-day instant (23:59:59.999Z) both show the same
  // calendar date the admin configured, so UTC rendering stays correct here.
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export interface CouponUseSnapshot {
  uses: number;
  max_uses: number | null;
}

export type CouponUseResult =
  | { consumed: true; uses: number }
  | { consumed: false; reason: "exhausted" | "conflict" | "error"; uses?: number };

export function shouldConsumeCouponForFinalization(input: {
  orderWasAlreadyPaid: boolean;
  orderClaimedByThisRequest: boolean;
}): boolean {
  return !input.orderWasAlreadyPaid && input.orderClaimedByThisRequest;
}

/**
 * Consume one use with optimistic compare-and-swap. The database callback must
 * update only when `uses === expectedUses`; retries let concurrent orders use
 * distinct remaining slots without ever writing beyond max_uses.
 */
export async function consumeCouponUseAtomic(
  load: () => Promise<CouponDatabaseResult<CouponUseSnapshot>>,
  compareAndSwap: (input: {
    expectedUses: number;
    nextUses: number;
    maxUses: number | null;
  }) => Promise<CouponDatabaseResult<CouponUseSnapshot>>,
  maxAttempts = 8,
): Promise<CouponUseResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const current = await load();
    if (current.error || !current.data) return { consumed: false, reason: "error" };

    const uses = Math.max(0, Math.trunc(current.data.uses));
    const maxUses = current.data.max_uses;
    if (maxUses !== null && uses >= maxUses) {
      return { consumed: false, reason: "exhausted", uses };
    }

    const updated = await compareAndSwap({
      expectedUses: uses,
      nextUses: uses + 1,
      maxUses,
    });
    if (updated.error) return { consumed: false, reason: "error", uses };
    if (updated.data) return { consumed: true, uses: updated.data.uses };
  }

  return { consumed: false, reason: "conflict" };
}
