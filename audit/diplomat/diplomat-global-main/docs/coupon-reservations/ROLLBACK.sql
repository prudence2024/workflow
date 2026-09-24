-- ============================================================================
-- ROLLBACK / RECOVERY — PROPOSAL ONLY. NOT APPLIED.
-- Order: drop v2 + healing helper FIRST (v1 remains available throughout —
-- no body reconstruction ever needed), then the STEP A objects.
-- No statement here touches coupons, orders, payment_transactions,
-- payment_financial_completions, or receipts — coupon.uses is never modified.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. REVERSE STEP B — drop the v2 finalizer + healing helper.
--    complete_verified_payment_v1 is NOT touched (it was never replaced).
-- ---------------------------------------------------------------------------
BEGIN;

REVOKE EXECUTE ON FUNCTION public.complete_verified_payment_v2(uuid,text,bigint,text,timestamptz) FROM service_role;
DROP FUNCTION public.complete_verified_payment_v2(uuid,text,bigint,text,timestamptz);

REVOKE EXECUTE ON FUNCTION public.heal_coupon_reservation_v1(uuid) FROM service_role;
DROP FUNCTION public.heal_coupon_reservation_v1(uuid);

COMMIT;

-- ---------------------------------------------------------------------------
-- 2. REVERSE STEP A — reservation functions, then the table.
-- ---------------------------------------------------------------------------
BEGIN;

REVOKE EXECUTE ON FUNCTION public.release_coupon_reservation_v1(uuid) FROM service_role;
DROP FUNCTION public.release_coupon_reservation_v1(uuid);

REVOKE EXECUTE ON FUNCTION public.reserve_coupon_use_v1(text, uuid, timestamptz) FROM service_role;
DROP FUNCTION public.reserve_coupon_use_v1(text, uuid, timestamptz);

DROP TABLE public.coupon_reservations;  -- feature data only; nothing references it

COMMIT;

-- ============================================================================
-- RECOVERY POSITIONS:
--   1. Both steps applied, flag ON   → set env flag OFF (v1 path restored
--      immediately), then reverse STEP B, then STEP A at leisure.
--   2. Only STEP A applied           → reverse STEP A; v1 path never changed.
--   3. Applied, flag OFF             → behaviour already v1; SQL reversal is
--      optional hygiene.
-- The flag lives in Vercel env (README §9), so the emergency path needs no DB
-- access: flipping the env var instantly returns every environment to the
-- untouched v1 finalizer.
-- ============================================================================
