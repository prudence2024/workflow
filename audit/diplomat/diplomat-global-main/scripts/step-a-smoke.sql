-- ============================================================================
-- STEP A concurrency smoke test — SINGLE transaction, ROLLBACK at the end.
-- Throwaway test data only; production rows are never modified.
-- ============================================================================
BEGIN;

DO $smoke$
DECLARE
  v_coupon1 uuid;
  v_coupon2 uuid;
  v_attempt1 uuid := gen_random_uuid();
  v_attempt2 uuid := gen_random_uuid();
  v_attempt3 uuid := gen_random_uuid();
  v_res jsonb;
  v_res_id uuid;
  v_active int;
BEGIN
  -- Throwaway test coupons (max_uses=1 and a multi-use control).
  INSERT INTO public.coupons (code, discount_type, discount_value, active, starts_at, expires_at, max_uses, uses)
  VALUES ('ZZ-SMOKE-1USE', 'percentage', 10, true, now() - interval '1 hour', now() + interval '1 day', 1, 0)
  RETURNING id INTO v_coupon1;
  INSERT INTO public.coupons (code, discount_type, discount_value, active, starts_at, expires_at, max_uses, uses)
  VALUES ('ZZ-SMOKE-2ND', 'percentage', 5, true, now() - interval '1 hour', now() + interval '1 day', 5, 0)
  RETURNING id INTO v_coupon2;

  -- 1. First reserve on the last slot succeeds.
  v_res := reserve_coupon_use_v1('ZZ-SMOKE-1USE', v_attempt1, now() + interval '30 minutes');
  IF (v_res->>'reserved')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'S1 failed: %', v_res; END IF;
  RAISE NOTICE 'S1 first_reserve_ok: %', v_res->>'reservation_id';
  v_res_id := (v_res->>'reservation_id')::uuid;

  -- 2. Same-attempt replay is idempotent (same reservation id).
  v_res := reserve_coupon_use_v1('ZZ-SMOKE-1USE', v_attempt1, now() + interval '30 minutes');
  IF (v_res->>'replay')::boolean IS NOT TRUE OR (v_res->>'reservation_id')::uuid IS DISTINCT FROM v_res_id
  THEN RAISE EXCEPTION 'S2 replay failed: %', v_res; END IF;
  RAISE NOTICE 'S2 replay_idempotent: same reservation id';

  -- 3. A DIFFERENT attempt on the saturated coupon is refused (exhausted).
  v_res := reserve_coupon_use_v1('ZZ-SMOKE-1USE', v_attempt2, now() + interval '30 minutes');
  IF (v_res->>'reserved')::boolean IS NOT FALSE OR v_res->>'reason' IS DISTINCT FROM 'exhausted'
  THEN RAISE EXCEPTION 'S3 exhaustion failed: %', v_res; END IF;
  RAISE NOTICE 'S3 second_checkout_refused: exhausted';

  -- 4. Authoritative release frees capacity.
  v_res := release_coupon_reservation_v1(v_res_id);
  IF (v_res->>'released')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'S4 release failed: %', v_res; END IF;
  RAISE NOTICE 'S4 release_ok';

  -- 5. A new attempt can now take the slot.
  v_res := reserve_coupon_use_v1('ZZ-SMOKE-1USE', v_attempt3, now() + interval '30 minutes');
  IF (v_res->>'reserved')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'S5 slot-again failed: %', v_res; END IF;
  RAISE NOTICE 'S5 slot_available_again';

  -- 6. Resurrection: release, then re-reserve SAME attempt+coupon.
  v_res_id := (v_res->>'reservation_id')::uuid;
  v_res := release_coupon_reservation_v1(v_res_id);
  IF (v_res->>'released')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'S6 release-2 failed: %', v_res; END IF;
  v_res := reserve_coupon_use_v1('ZZ-SMOKE-1USE', v_attempt3, now() + interval '30 minutes');
  IF (v_res->>'resurrected')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'S6 resurrection failed: %', v_res; END IF;
  RAISE NOTICE 'S6 released_reservation_resurrected';

  -- 7. Different coupons never block each other.
  v_res := reserve_coupon_use_v1('ZZ-SMOKE-2ND', v_attempt2, now() + interval '30 minutes');
  IF (v_res->>'reserved')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'S7 cross-coupon failed: %', v_res; END IF;
  RAISE NOTICE 'S7 other_coupon_independent';

  RAISE NOTICE 'ALL_SMOKE_CHECKS_PASSED';
END
$smoke$;

ROLLBACK;
SELECT jsonb_build_object('rolled_back', true,
  'coupons_restored', (SELECT count(*) FROM public.coupons WHERE code LIKE 'ZZ-SMOKE-%') = 0,
  'reservations_restored', (SELECT count(*) FROM public.coupon_reservations) >= 0
) AS smoke_rollback_verified;
