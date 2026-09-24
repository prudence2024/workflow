-- ============================================================================
-- PROPOSAL ONLY — OWNER-GATED. DO NOT APPLY.
-- ============================================================================
-- STEP A of 2: coupon_reservations schema + reserve/release RPCs.
-- (STEP B, the same-transaction conversion revision of complete_verified_payment_v1,
--  is in PROPOSED-STEP-B-CONVERSION.sql. Both steps are separately reviewable.)
--
-- Intended final filenames (assigned at apply time, Owner present):
--   supabase/migrations/20260914120000_coupon_reservations.sql          (this file)
--   supabase/migrations/20260914120100_coupon_reservation_conversion.sql (STEP B)
--
-- Defect closed: limited-use coupon two-checkout last-use race.
-- Companion document: docs/coupon-reservations/README.md
--
-- ============================================================================
-- CONCURRENCY MECHANISM (corrected after Owner review)
-- ============================================================================
-- A plpgsql function does NOT create an independent child transaction with its
-- own isolation lifecycle: it runs inside the caller's transaction, and
-- PostgREST/supabase-js calls run READ COMMITTED. An in-function SERIALIZABLE
-- retry model was therefore unprovable through the real invocation path and is
-- RETIRED.
--
-- CHOSEN MECHANISM: single-row `SELECT ... FOR UPDATE` on the coupon row.
--
--   reserve_coupon_use_v1:
--     1. replay probe on the attempt's reservation rows (plain index read)
--     2. SELECT coupon row FOR UPDATE                  (THE lock boundary)
--     3. while holding that lock: window/status checks,
--        capacity = uses + COUNT(state='reserved' AND expires_at > now()),
--        INSERT the reservation iff capacity remains
--
--   Every capacity-affecting writer takes the same coupon-row lock first:
--     - reserve (this file)
--     - finalize conversion (STEP B: the existing RPC already locks the coupon
--       row before `uses = uses + 1`; the revised block keeps that order and
--       converts the reservation row AFTER the coupon lock)
--     - release (release_coupon_reservation_v1 locks the coupon row, then CAS
--       the reservation row — lock order coupon → reservation everywhere)
--
--   Therefore the count+insert critical section is serialized per coupon under
--   READ COMMITTED: two tabs fighting for the last slot → the second blocks on
--   the row lock, then reads the first's committed reservation and returns
--   {reserved:false, reason:'exhausted'}. LAST_SLOT_DOUBLE_RESERVATION_POSSIBLE=NO.
--
--   UNRELATED_COUPONS_BLOCKED=NO (different coupon rows = different locks).
--   Reserve is a lock LEAF (it locks only the coupon row); finalize's chain
--   (order → transaction → coupon) can never cycle with it.
--
--   Residual benign false-negative: none — releases also take the coupon lock,
--   so no release can slip between count and insert either.
--
-- ============================================================================
-- DESIGN INVARIANTS
-- ============================================================================
-- R1  Reservation binding: UNIQUE(coupon_id, checkout_attempt_id) for full
--     history + a PARTIAL UNIQUE(checkout_attempt_id) WHERE state='reserved'
--     enforcing ONE ACTIVE reservation per attempt at the DB level.
--     Lifecycle verified (checkout.server.ts:341): a coupon CHANGE mints a NEW
--     checkout_attempt_id (order reuse requires an exact quote match incl.
--     coupon; on mismatch the server mints a fresh attempt id and abandons the
--     old order) — so one attempt never legitimately holds two coupons.
--     ONE_ACTIVE_COUPON_PER_CHECKOUT=TRUE (DB-enforced). This is deliberately
--     NOT ONE_COUPON_EVER_PER_CHECKOUT_ATTEMPT: released/expired rows remain
--     as history and never block a new reservation.
-- R2  Replay idempotency + resurrection: an ACTIVE reservation is returned
--     as-is (idempotent, incl. racing replays); a released/expired reservation
--     for the SAME coupon is RESURRECTED — capacity re-checked, CAS reserved,
--     expires_at extended — so UNIQUE constraints never block a legitimate
--     retry after decline/expiry; a terminal row for a DIFFERENT coupon is
--     left as history and a fresh row is inserted.
-- R3  Capacity = uses + active(unexpired) reservations; evaluated only inside
--     the coupon-row lock. The browser never determines remaining uses.
-- R4  A reservation is active iff state='reserved' AND expires_at > now().
--     Cleanup jobs are NEVER required for correctness (predicate-based).
-- R5  Exactly-once transitions: reserved→converted once, reserved→released
--     once (CAS on state); terminal rows are immutable.
-- ============================================================================

BEGIN;

-- 1. TABLE -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coupon_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Capacity source. ON DELETE RESTRICT: deleting a coupon with reservation
  -- history fails loudly instead of corrupting capacity accounting (soft-delete
  -- via active=false is the supported path).
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,

  -- Immutable checkout binding (orders.checkout_attempt_id is UNIQUE per
  -- 20260827111438_checkout_hardening.sql). Server-supplied; never
  -- browser-rebindable after creation.
  checkout_attempt_id uuid NOT NULL,

  -- Backfilled by the FINALIZE transaction (STEP B) — never by any other path.
  reference text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,

  state text NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved', 'converted', 'released')),

  reserved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,          -- absolute instant; server-chosen
  converted_at timestamptz,
  released_at timestamptz,

  CHECK (
    (state = 'reserved'  AND converted_at IS NULL AND released_at IS NULL)
    OR
    (state = 'converted' AND converted_at IS NOT NULL AND released_at IS NULL)
    OR
    (state = 'released'  AND converted_at IS NULL AND released_at IS NOT NULL)
  )
);

COMMENT ON TABLE public.coupon_reservations IS
  'Owner-gated P0 concurrency fix: atomic per-checkout reservation of limited-coupon capacity. See docs/coupon-reservations/README.md.';

-- 2. CONSTRAINTS / INDEXES ----------------------------------------------------

-- R1a: full history — one reservation row per (coupon, checkout attempt) pair.
ALTER TABLE public.coupon_reservations
  ADD CONSTRAINT coupon_reservations_coupon_checkout_key
  UNIQUE (coupon_id, checkout_attempt_id);

-- R1b: DB-enforced ONE ACTIVE reservation per checkout attempt. Released/
-- expired rows do not occupy the slot (Owner-mandated coupon-switch-after-
-- release support; see R1 lifecycle note).
CREATE UNIQUE INDEX IF NOT EXISTS coupon_reservations_one_active_per_checkout_idx
  ON public.coupon_reservations (checkout_attempt_id)
  WHERE state = 'reserved';

-- Capacity lookup serving the reserve COUNT and the (optional, cosmetic) TTL
-- sweep: coupon_id + state + expires_at.
CREATE INDEX IF NOT EXISTS coupon_reservations_active_idx
  ON public.coupon_reservations (coupon_id, expires_at)
  WHERE state = 'reserved';

-- 3. RLS + GRANTS -------------------------------------------------------------

ALTER TABLE public.coupon_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_reservations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.coupon_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.coupon_reservations TO service_role;

-- 4. RESERVE RPC --------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reserve_coupon_use_v1(
  p_code text,
  p_checkout_attempt_id uuid,
  p_expires_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_coupon   public.coupons%ROWTYPE;
  v_existing public.coupon_reservations%ROWTYPE;
  v_active   integer;
  v_row      public.coupon_reservations%ROWTYPE;
BEGIN
  -- Server-side normalization mirroring src/lib/coupon-lifecycle.ts.
  p_code := upper(btrim(p_code));
  IF p_code IS NULL OR p_code = '' OR p_checkout_attempt_id IS NULL THEN
    RAISE EXCEPTION 'reserve_coupon_use_v1: invalid arguments';
  END IF;
  -- TTL sanity: future, bounded ≤ 24h (exact value chosen server-side, 30 min).
  IF p_expires_at IS NULL OR p_expires_at <= now()
     OR p_expires_at > now() + interval '24 hours' THEN
    RAISE EXCEPTION 'reserve_coupon_use_v1: expires_at out of allowed range';
  END IF;

  -- -- R2: replay probe (index read on the attempt's rows; no locks yet) ------
  -- An ACTIVE reservation (same or any coupon) is returned as-is. Terminal rows
  -- for the REQUESTED coupon are resurrectable (below); terminal rows for a
  -- DIFFERENT coupon remain history and a fresh row is inserted.
  SELECT * INTO v_existing
    FROM public.coupon_reservations
   WHERE checkout_attempt_id = p_checkout_attempt_id
     AND state = 'reserved'
     AND expires_at > now()
   ORDER BY reserved_at DESC
   LIMIT 1;
  IF FOUND THEN
    IF v_existing.coupon_id = (SELECT id FROM public.coupons WHERE code = p_code) THEN
      RETURN jsonb_build_object('reserved', true, 'replay', true,
        'reservation_id', v_existing.id,
        'expires_at', v_existing.expires_at, 'state', v_existing.state);
    END IF;
    -- Attempt holds an active reservation for a DIFFERENT coupon. With the
    -- app-level invariant that a coupon change mints a new attempt id, this is
    -- a stale client — refuse rather than mutate another flow's slot.
    RETURN jsonb_build_object('reserved', false, 'replay', true,
      'reservation_id', v_existing.id, 'state', v_existing.state,
      'reason', 'attempt_holds_different_coupon');
  END IF;

  -- -- Canonical locking boundary: THE coupon row ----------------------------
  SELECT * INTO v_coupon FROM public.coupons WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('reserved', false, 'reason', 'coupon_not_found');
  END IF;

  -- Re-probe AFTER the lock: a same-attempt twin reserve that committed while
  -- we waited on the coupon lock is recognized as a replay here, so it can
  -- never fall through to the capacity check and misreport 'exhausted'.
  SELECT * INTO v_existing
    FROM public.coupon_reservations
   WHERE checkout_attempt_id = p_checkout_attempt_id
     AND coupon_id = v_coupon.id
     AND state = 'reserved'
     AND expires_at > now()
   ORDER BY reserved_at DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('reserved', true, 'replay', true,
      'reservation_id', v_existing.id,
      'expires_at', v_existing.expires_at, 'state', v_existing.state);
  END IF;

  -- Server-side window/status checks (absolute instants; mirrors getCouponState).
  IF NOT v_coupon.active THEN
    RETURN jsonb_build_object('reserved', false, 'reason', 'not_active');
  END IF;
  IF v_coupon.starts_at IS NOT NULL AND v_coupon.starts_at > now() THEN
    RETURN jsonb_build_object('reserved', false, 'reason', 'not_yet_valid');
  END IF;
  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at <= now() THEN
    RETURN jsonb_build_object('reserved', false, 'reason', 'window_ended');
  END IF;

  -- -- Unlimited coupons need NO capacity reservation (README §7) ------------
  IF v_coupon.max_uses IS NULL THEN
    RETURN jsonb_build_object('reserved', true, 'unlimited', true,
                              'reservation_id', NULL);
  END IF;

  -- Capacity read + insert while holding the coupon-row lock (R3).
  SELECT count(*) INTO v_active
    FROM public.coupon_reservations
   WHERE coupon_id = v_coupon.id
     AND state = 'reserved'
     AND expires_at > now();     -- R4: predicate-based activity

  IF v_coupon.uses + v_active >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('reserved', false, 'reason', 'exhausted');
  END IF;

  -- -- R2 resurrection: a terminal row for THIS coupon + attempt -------------
  -- (declined/expired earlier, customer retries with the same coupon) gets
  -- capacity-checked and CAS-resurrected with a fresh TTL. History is
  -- preserved (auditable); UNIQUE constraints never block a legitimate retry.
  SELECT * INTO v_existing
    FROM public.coupon_reservations
   WHERE checkout_attempt_id = p_checkout_attempt_id
     AND coupon_id = v_coupon.id
     AND state IN ('released', 'converted')
   ORDER BY reserved_at DESC
   LIMIT 1;
  IF FOUND THEN
    IF v_existing.state = 'converted' THEN
      -- Already redeemed for this checkout: never take a second slot.
      RETURN jsonb_build_object('reserved', false, 'replay', true,
        'reservation_id', v_existing.id, 'state', v_existing.state,
        'reason', 'already_converted');
    END IF;
    UPDATE public.coupon_reservations
       SET state = 'reserved', released_at = NULL, expires_at = p_expires_at,
           reserved_at = now()
     WHERE id = v_existing.id AND state = 'released';
    IF FOUND THEN
      RETURN jsonb_build_object('reserved', true, 'resurrected', true,
        'reservation_id', v_existing.id, 'expires_at', p_expires_at,
        'state', 'reserved');
    END IF;
    -- CAS lost (concurrent transition): fall through to a fresh insert.
  END IF;

  BEGIN
    INSERT INTO public.coupon_reservations(
      coupon_id, checkout_attempt_id, state, expires_at)
    VALUES (v_coupon.id, p_checkout_attempt_id, 'reserved', p_expires_at)
    RETURNING * INTO v_row;
  EXCEPTION
    WHEN unique_violation THEN
      -- Racing replay for the SAME (coupon, attempt): re-read and report the
      -- winner's row without taking another slot.
      SELECT * INTO v_existing
        FROM public.coupon_reservations
       WHERE coupon_id = v_coupon.id
         AND checkout_attempt_id = p_checkout_attempt_id;
      RETURN jsonb_build_object('reserved', v_existing.state = 'reserved'
                                  AND v_existing.expires_at > now(),
        'replay', true, 'reservation_id', v_existing.id,
        'state', v_existing.state, 'reason', 'reservation_not_active');
  END;

  RETURN jsonb_build_object('reserved', true,
    'reservation_id', v_row.id, 'expires_at', v_row.expires_at,
    'state', v_row.state);
END;
$$;

-- 5. RELEASE RPC ---------------------------------------------------------------
-- Used by the app ONLY for authoritative outcomes: declined / failed / cancelled
-- (see README §4). UNKNOWN provider state must NOT call this — TTL covers it.

CREATE OR REPLACE FUNCTION public.release_coupon_reservation_v1(
  p_reservation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_res public.coupon_reservations%ROWTYPE;
  v_updated integer;
BEGIN
  IF p_reservation_id IS NULL THEN
    RAISE EXCEPTION 'release_coupon_reservation_v1: invalid arguments';
  END IF;

  SELECT * INTO v_res FROM public.coupon_reservations
   WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('released', false, 'reason', 'not_found');
  END IF;

  -- Same lock order as reserve/finalize: coupon row first, then the
  -- reservation row — keeps the reserve count+insert window serialized
  -- against releases.
  PERFORM 1 FROM public.coupons WHERE id = v_res.coupon_id FOR UPDATE;

  IF v_res.state <> 'reserved' THEN
    RETURN jsonb_build_object('released', false, 'reason', 'not_reserved',
                              'state', v_res.state);
  END IF;

  UPDATE public.coupon_reservations
     SET state = 'released', released_at = now()
   WHERE id = p_reservation_id AND state = 'reserved';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('released', v_updated = 1);
END;
$$;

-- 6. EXECUTE GRANTS ------------------------------------------------------------

REVOKE ALL ON FUNCTION public.reserve_coupon_use_v1(text, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_coupon_use_v1(text, uuid, timestamptz)
  TO service_role;

REVOKE ALL ON FUNCTION public.release_coupon_reservation_v1(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_coupon_reservation_v1(uuid)
  TO service_role;

COMMIT;

-- ============================================================================
-- FORWARD SQL END. Rollback/recovery: docs/coupon-reservations/ROLLBACK.sql
--
-- Exact signatures:
--   reserve_coupon_use_v1(p_code text, p_checkout_attempt_id uuid,
--                         p_expires_at timestamptz) RETURNS jsonb
--   release_coupon_reservation_v1(p_reservation_id uuid) RETURNS jsonb
-- Exact grants:
--   table:  REVOKE ALL FROM PUBLIC, anon, authenticated;
--           GRANT SELECT, INSERT, UPDATE TO service_role;
--   both fns: REVOKE ALL FROM PUBLIC, anon, authenticated;
--             GRANT EXECUTE TO service_role;
-- Exact constraints/indexes:
--   PK id; FK coupon_id RESTRICT; FK order_id SET NULL; state CHECK;
--   terminal-shape CHECK; UNIQUE(coupon_id, checkout_attempt_id);
--   partial UNIQUE(checkout_attempt_id) WHERE state='reserved';
--   partial (coupon_id, expires_at) WHERE state='reserved'.
-- ============================================================================
