-- ============================================================================
-- PROPOSAL ONLY — OWNER-GATED. DO NOT APPLY.
-- ============================================================================
-- STEP B (v3, final): versioned finalizer — complete_verified_payment_v2.
--
-- Intended final filename (assigned at apply time, Owner present):
--   supabase/migrations/20260914120100_payment_finalization_v2.sql
--
-- ----------------------------------------------------------------------------
-- V1 IS PRESERVED BYTE-FOR-BYTE. V1_CHANGED=NO.
-- This file contains NO CREATE OR REPLACE on complete_verified_payment_v1.
-- Production (flag OFF) keeps calling v1; its body, signature, and grants are
-- untouched by this migration. Rollback therefore never needs to reconstruct
-- the v1 body.
-- ----------------------------------------------------------------------------
--
-- Routing model (application-side selector, README §7):
--   COUPON_RESERVATIONS_V1_ENABLED === "true"  → reserve_coupon_use_v1 + v2
--   otherwise (false OR MISSING)               → v1 only
-- Both callback and webhook finalization use the ONE server-side selector.
-- The browser can never select the RPC version.
--
-- v2 = the exact v1 financial-security invariants + reservation-aware coupon
-- handling + already-complete healing. Same argument shape as v1 so switching
-- is explicit and small.
--
-- Lock order (identical to v1 until the coupon step):
--   order → transaction → items → coupon → reservation (FOR UPDATE, released
--   only at COMMIT). Reserve (STEP A) is a coupon-row lock LEAF; release locks
--   coupon → reservation. No cycle.
--
-- Cross-version safety (v1 running concurrently with v2 on the same order):
--   v1 and v2 both begin by locking the same order row and both insert into
--   payment_financial_completions (PK order_id) after the same already-complete
--   probe held under that lock. Whichever commits first wins; the loser's
--   probe then sees the completion row and returns idempotently.
--     v1 wins → v2 replay: already-complete path heals a still-'reserved'
--               reservation (evidence-checked) — V1_WINS_V2_HEAL_BEHAVIOR below.
--     v2 wins → v1 replay: v1's probe finds the completion row and returns
--               {complete:true, already_complete:true} — zero deltas.
--     Coupon use: v1 and v2 both increment under the SAME coupon-row lock with
--     the same uses<max_uses precondition, so no double increment is possible
--     across versions.
-- ============================================================================

BEGIN;

-- ============================================================================
-- [STEP B v3] Already-complete healing helper.
-- Idempotent repair: flips a still-'reserved' reservation to 'converted' ONLY
-- when authoritative evidence (an existing payment_financial_completions row
-- for the order whose coupon matches the reservation, via the order's
-- checkout_attempt_id) proves that order already completed using this
-- coupon/checkout. Zero side effects otherwise (no coupon/inventory/ledger
-- writes, no second completion, no receipt). Executed only by service_role.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.heal_coupon_reservation_v1(
  p_order_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order      public.orders%ROWTYPE;
  v_completion public.payment_financial_completions%ROWTYPE;
  v_res        public.coupon_reservations%ROWTYPE;
  v_updated    integer := 0;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'heal_coupon_reservation_v1: invalid arguments';
  END IF;

  -- Same lock order as finalize: order row first, then coupon, then reservation.
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('healed', false, 'reason', 'order_not_found');
  END IF;

  -- Healing evidence: an authoritative completion must exist. No completion →
  -- nothing to heal (the caller is simply early, not a repair situation).
  SELECT * INTO v_completion
    FROM public.payment_financial_completions
   WHERE order_id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('healed', false, 'reason', 'no_completion');
  END IF;

  IF v_order.coupon_id IS NULL THEN
    RETURN jsonb_build_object('healed', false, 'reason', 'order_has_no_coupon');
  END IF;

  SELECT * INTO v_res
    FROM public.coupon_reservations
   WHERE checkout_attempt_id = v_order.checkout_attempt_id
     AND state = 'reserved'
   ORDER BY reserved_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('healed', false, 'reason', 'no_active_reservation');
  END IF;

  -- The reservation must belong to the coupon the completed order actually used.
  IF v_res.coupon_id IS DISTINCT FROM v_order.coupon_id THEN
    RETURN jsonb_build_object('healed', false, 'reason', 'coupon_mismatch');
  END IF;

  UPDATE public.coupon_reservations
     SET state = 'converted', converted_at = now(),
         reference = v_completion.reference, order_id = v_order.id
   WHERE id = v_res.id AND state = 'reserved';
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('healed', v_updated = 1,
    'reservation_id', v_res.id);
END;
$$;

REVOKE ALL ON FUNCTION public.heal_coupon_reservation_v1(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heal_coupon_reservation_v1(uuid) TO service_role;

-- ============================================================================
-- complete_verified_payment_v2 — reservation-aware finalizer.
-- Body = LIVE v1 body (captured 2026-09-14, sha256 d115c1a7262c4865840434860a2c7c5a85a
-- b0c7503b9afd5b6c5e3e3e4433c38, see .freebuff/db-checkpoints/v1-live-body-clean.sql)
-- with exactly THREE marked deltas: [V2-1] reservation locate, [V2-2] same-tx
-- conversion + over-redemption audit, [V2-3] already-complete healing — and the
-- flow-version guard accepting marker '2' instead of '1'. Everything else is
-- statement-for-statement identical to live v1, including the LIVE (stronger)
-- item-snapshot check, conflicting-completion checks, and historical guard.
-- Drift reconciliation 2026-09-14: the live v1 body proved stronger than the
-- docs/payment-finalization/PROPOSED.sql copy; the live text is authoritative.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_verified_payment_v2(
  p_transaction_id uuid, p_reference text, p_amount_kobo bigint,
  p_currency text, p_verified_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  t public.payment_transactions%ROWTYPE;
  o public.orders%ROWTYPE;
  c public.payment_financial_completions%ROWTYPE;
  q jsonb;
  expected_items jsonb;
  actual_items jsonb;
  item record;
  coupon_row public.coupons%ROWTYPE;
  target_order uuid;
  v_res       public.coupon_reservations%ROWTYPE;  -- [V2-1]
  v_res_bound boolean := false;                    -- [V2-1]
  v_consume   boolean := false;                    -- [V2-2]
BEGIN
  IF p_reference = 'DG-MTLML9QG-WWA7' THEN
    RAISE EXCEPTION 'Historical payment requires separate Owner reconciliation';
  END IF;
  SELECT order_id INTO target_order FROM public.payment_transactions WHERE id = p_transaction_id;
  IF target_order IS NULL THEN RAISE EXCEPTION 'Unknown payment'; END IF;
  -- Same lock order for every caller; different attempts for one order serialize.
  SELECT * INTO STRICT o FROM public.orders WHERE id = target_order FOR UPDATE;
  SELECT * INTO STRICT t FROM public.payment_transactions WHERE id = p_transaction_id FOR UPDATE;
  q := t.metadata->'quote';
  -- [V2] Flow-version guard (replaces v1's marker='1' equality check).
  -- Accepts ONLY the v2 marker: new v2 payments are stamped
  -- financial_finalization_version=2 at attempt creation (server-authored,
  -- immutable). Legacy/no-marker transactions must finalize via v1, so v2
  -- rejects them rather than silently applying v2 semantics — and v1 is never
  -- modified, so v1 payments keep finalizing through the untouched v1 RPC.
  IF t.metadata->>'financial_finalization_version' IS DISTINCT FROM '2'
    OR t.order_id IS DISTINCT FROM o.id OR t.reference IS DISTINCT FROM p_reference
    OR t.paystack_reference IS DISTINCT FROM p_reference
    OR t.metadata->>'quote_version' IS DISTINCT FROM '2'
    OR t.metadata->>'order_id' IS DISTINCT FROM o.id::text
    OR t.metadata->>'order_reference' IS DISTINCT FROM o.reference
    OR q IS NULL OR jsonb_typeof(q->'items') IS DISTINCT FROM 'array'
    OR jsonb_array_length(q->'items') = 0
    OR p_currency IS DISTINCT FROM 'NGN' OR t.currency IS DISTINCT FROM p_currency
    OR q->>'currency' IS DISTINCT FROM p_currency OR o.currency IS DISTINCT FROM p_currency
    OR t.amount IS DISTINCT FROM (q->>'total')::numeric
    OR p_amount_kobo IS DISTINCT FROM round(t.amount * 100)::bigint
    OR o.total IS DISTINCT FROM t.amount
    OR o.subtotal IS DISTINCT FROM (q->>'subtotal')::numeric
    OR o.discount IS DISTINCT FROM (q->>'discount')::numeric
    OR o.delivery_fee IS DISTINCT FROM (q->>'delivery_fee')::numeric
    OR o.coupon_id IS DISTINCT FROM nullif(q->>'coupon_id', '')::uuid
    OR o.total IS DISTINCT FROM o.subtotal - o.discount + o.delivery_fee
    OR p_verified_at IS NULL OR p_verified_at > now() + interval '1 minute'
    OR p_verified_at < now() - interval '10 minutes'
  THEN RAISE EXCEPTION 'Payment binding rejected'; END IF;

  -- Lock immutable item rows, then compare the exact server snapshot.
  PERFORM id FROM public.order_items WHERE order_id = o.id ORDER BY id FOR UPDATE;
  SELECT jsonb_agg(jsonb_build_object('product_id', product_id, 'sku', sku, 'name', name,
    'quantity', quantity, 'unit_price', unit_price, 'line_total', line_total) ORDER BY product_id)
    INTO actual_items FROM public.order_items WHERE order_id = o.id;
  SELECT jsonb_agg(value - 'cost_price' ORDER BY value->>'product_id')
    INTO expected_items FROM jsonb_array_elements(q->'items');
  IF actual_items IS DISTINCT FROM expected_items OR EXISTS (
    SELECT 1 FROM public.order_items WHERE order_id = o.id
    AND (product_id IS NULL OR quantity <= 0 OR line_total <> unit_price * quantity)
  ) OR (SELECT sum(line_total) FROM public.order_items WHERE order_id = o.id) IS DISTINCT FROM o.subtotal
  THEN RAISE EXCEPTION 'Order snapshot rejected'; END IF;

  SELECT * INTO c FROM public.payment_financial_completions WHERE order_id = o.id;
  IF FOUND THEN
    IF c.transaction_id IS DISTINCT FROM t.id OR c.reference IS DISTINCT FROM p_reference
      OR c.quote IS DISTINCT FROM q OR o.payment_reference IS DISTINCT FROM p_reference
      OR o.status NOT IN ('paid','processing','shipped','delivered') OR t.status <> 'successful'
    THEN RAISE EXCEPTION 'Conflicting completion'; END IF;
    -- [V2-3] Already-complete healing (idempotent repair, zero financial
    -- deltas): if a rollout-era v1 win or any other path completed this order
    -- while its reservation is still 'reserved', flip it to 'converted' under
    -- the same transaction. Ledger/coupon/inventory deltas remain 0; no
    -- second completion, no receipt.
    PERFORM public.heal_coupon_reservation_v1(o.id);
    RETURN jsonb_build_object('complete', true, 'already_complete', true, 'order_id', o.id);
  END IF;
  -- Existing paid rows without a ledger have ambiguous effects: never guess/backfill.
  IF o.status NOT IN ('pending','abandoned') OR t.status NOT IN ('initiated','pending','successful')
  THEN RAISE EXCEPTION 'Unmarked historical state requires reconciliation'; END IF;

  -- Sorted product locks avoid deadlocks across orders sharing multiple products.
  FOR item IN SELECT product_id, sum(quantity)::integer AS quantity FROM public.order_items
    WHERE order_id = o.id GROUP BY product_id ORDER BY product_id
  LOOP
    UPDATE public.inventory SET quantity = quantity - item.quantity
      WHERE product_id = item.product_id AND quantity - coalesce(reserved, 0) >= item.quantity;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventory requires reconciliation'; END IF;
  END LOOP;
  IF o.coupon_id IS NOT NULL THEN
    SELECT * INTO STRICT coupon_row FROM public.coupons WHERE id = o.coupon_id FOR UPDATE;

    -- [V2-1] Locate the reservation AFTER the coupon lock (lock order:
    -- order → transaction → items → coupon → reservation) via the order's
    -- authoritative checkout_attempt_id. A reservation bound to a different
    -- coupon than the order's is never converted (binding divergence; it
    -- expires by TTL — conservative in every direction).
    SELECT * INTO v_res FROM public.coupon_reservations
     WHERE checkout_attempt_id = o.checkout_attempt_id
       AND state = 'reserved'
     ORDER BY reserved_at DESC
     LIMIT 1 FOR UPDATE;
    v_res_bound := FOUND AND v_res.coupon_id = o.coupon_id;

    -- Consume the verified immutable purchase entitlement; do not recalculate its discount.
    IF coupon_row.max_uses IS NOT NULL AND coupon_row.uses >= coupon_row.max_uses
    THEN
      -- [V2-2] LATE-SUCCESS POLICY (Owner-mandated): provider success after
      -- reservation expiry/loss (or any capacity shortfall) must NEVER reject
      -- a charged customer. Honor provider truth + the immutable quote,
      -- finalize exactly once, record over-redemption for reconciliation.
      -- No auto-refund; order never left pending.
      INSERT INTO public.audit_logs(clerk_user_id, action, entity_type, entity_id, metadata)
      VALUES ('system', 'payment.coupon_over_redemption', 'order', o.id,
              jsonb_build_object(
                'reference', p_reference,
                'coupon_id', o.coupon_id,
                'reason', CASE WHEN EXISTS (
                         SELECT 1 FROM public.coupon_reservations
                          WHERE checkout_attempt_id = o.checkout_attempt_id)
                         THEN 'late_success_after_capacity_loss'
                         ELSE 'no_reservation' END));
      v_consume := false;
    ELSE
      UPDATE public.coupons SET uses = uses + 1 WHERE id = o.coupon_id;
      v_consume := true;
    END IF;
  END IF;

  -- [V2-2] reserved → converted IN THIS SAME TRANSACTION (after the coupon
  -- increment, still under the coupon-row lock — no commit gap:
  -- V2_COUPON_CONVERSION_ATOMIC=YES).
  IF v_consume AND v_res_bound THEN
    UPDATE public.coupon_reservations
       SET state = 'converted', converted_at = now(),
           reference = p_reference, order_id = o.id
     WHERE id = v_res.id AND state = 'reserved';
    IF NOT FOUND THEN RAISE EXCEPTION 'Reservation state changed'; END IF;
  END IF;

  UPDATE public.payment_transactions SET status = 'successful', paid_at = coalesce(paid_at, p_verified_at)
    WHERE id = t.id;
  UPDATE public.orders SET status = 'paid', payment_reference = p_reference WHERE id = o.id;
  INSERT INTO public.payment_financial_completions(order_id, transaction_id, reference, quote, provider_verified_at)
    VALUES (o.id, t.id, p_reference, q, p_verified_at);
  RETURN jsonb_build_object('complete', true, 'already_complete', false, 'order_id', o.id);
END;
$$;

-- Same grant shape as v1 (identical security posture).
REVOKE ALL ON FUNCTION public.complete_verified_payment_v2(uuid,text,bigint,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_verified_payment_v2(uuid,text,bigint,text,timestamptz) TO service_role;

COMMIT;

-- ============================================================================
-- FORWARD SQL END.
-- Exact new objects:
--   heal_coupon_reservation_v1(p_order_id uuid) RETURNS jsonb
--   complete_verified_payment_v2(p_transaction_id uuid, p_reference text,
--     p_amount_kobo bigint, p_currency text, p_verified_at timestamptz)
--     RETURNS jsonb
-- Untouched: complete_verified_payment_v1 (V1_CHANGED=NO).
-- Rollback: docs/coupon-reservations/ROLLBACK.sql (drops v2 + helper FIRST;
--   v1 remains available throughout).
-- ============================================================================
