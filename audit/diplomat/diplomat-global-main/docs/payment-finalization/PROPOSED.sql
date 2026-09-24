-- PROPOSAL ONLY. NOT in the automatic migration directory. Owner approval required.
-- Separate from Migration A/B. Apply only after the documented preflight and rollout.
BEGIN;
CREATE TABLE public.payment_financial_completions (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE RESTRICT,
  transaction_id uuid NOT NULL UNIQUE REFERENCES public.payment_transactions(id) ON DELETE RESTRICT,
  reference text NOT NULL UNIQUE,
  quote jsonb NOT NULL,
  provider_verified_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_financial_completions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_financial_completions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.payment_financial_completions TO service_role;

-- Inputs are supplied ONLY by the server after Paystack GET verification.
-- No HTTP/provider work runs in this PostgreSQL transaction.
CREATE FUNCTION public.complete_verified_payment_v1(
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
  IF t.order_id IS DISTINCT FROM o.id OR t.reference IS DISTINCT FROM p_reference
    OR t.paystack_reference IS DISTINCT FROM p_reference
    OR t.metadata->>'financial_finalization_version' IS DISTINCT FROM '1'
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
    -- Consume the verified immutable purchase entitlement; do not recalculate its discount.
    IF coupon_row.max_uses IS NOT NULL AND coupon_row.uses >= coupon_row.max_uses
    THEN RAISE EXCEPTION 'Coupon requires reconciliation'; END IF;
    UPDATE public.coupons SET uses = uses + 1 WHERE id = o.coupon_id;
  END IF;
  UPDATE public.payment_transactions SET status = 'successful', paid_at = coalesce(paid_at, p_verified_at)
    WHERE id = t.id;
  UPDATE public.orders SET status = 'paid', payment_reference = p_reference WHERE id = o.id;
  INSERT INTO public.payment_financial_completions(order_id, transaction_id, reference, quote, provider_verified_at)
    VALUES (o.id, t.id, p_reference, q, p_verified_at);
  RETURN jsonb_build_object('complete', true, 'already_complete', false, 'order_id', o.id);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_verified_payment_v1(uuid,text,bigint,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_verified_payment_v1(uuid,text,bigint,text,timestamptz) TO service_role;
COMMIT;
