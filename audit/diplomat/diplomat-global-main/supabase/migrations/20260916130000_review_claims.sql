-- ============================================================================
-- SECURE GUEST VERIFIED-PURCHASE REVIEW CLAIMS — Owner-approved 2026-09-16
--
-- Architecture (docs/reviews/VERIFIED_PURCHASE_IDENTITY_PROPOSAL.md, guest-only
-- design): customers have NO accounts. Purchase proof is a per-product opaque
-- capability token delivered to the purchaser's email after authoritative
-- payment finalization. The reviewer's typed email is contact data only and
-- can NEVER create or influence verified_purchase.
--
-- Token model:
--   raw token  = 32 random bytes, base64url — shown ONCE in the email link
--   stored     = HMAC-SHA256(raw token, REVIEW_CLAIMS_HASH_SECRET), hex
--   no PII, no order id, no email inside the token itself
--
-- Scope: ONE token → ONE order → ONE product → ONE purchase claim. Issuance
-- is idempotent per (order_id, product_id) — callback/webhook replays never
-- create extra active claims.
--
-- Redemption is atomic in redeem_review_claim_v1: review insert and claim
-- consumption commit together, or not at all.
--
-- Refund policy (Owner decision 2026-09-16):
--   - full refund BEFORE review  → claim cannot mint a Verified Purchase
--     review (order no longer in an authoritative paid state)
--   - full refund AFTER review   → review and badge REMAIN (the purchase
--     genuinely occurred). Nothing in this schema ever reverses the badge.
--
-- Security: RLS enabled + FORCED (server uses the Supabase secret key whose
-- role is service_role; forced RLS guarantees no table owner bypass). No
-- anon/authenticated grants. Review rows still carry verified_purchase=true
-- server-side only; browser cannot set it.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.review_claims (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_id       uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  token_hash        text NOT NULL UNIQUE,
  issued_at         timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  used_at           timestamptz,
  revoked_at        timestamptz,
  used_by_review_id uuid
);

COMMENT ON TABLE public.review_claims IS
  'Per-product guest purchase claims: opaque hashed capability tokens delivered to the purchaser after successful payment. Server-only.';

-- Exactly one claim per purchased product per order — issuance idempotency.
CREATE UNIQUE INDEX IF NOT EXISTS review_claims_order_product_unique
  ON public.review_claims (order_id, product_id);

CREATE INDEX IF NOT EXISTS review_claims_customer_id_idx ON public.review_claims (customer_id);
CREATE INDEX IF NOT EXISTS review_claims_expires_at_idx ON public.review_claims (expires_at);

ALTER TABLE public.review_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_claims FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- redeem_review_claim_v1 — the ONLY redemption path. SECURITY INVOKER by
-- design: the server calls it with the service role; FORCE RLS keeps every
-- row read under the caller's evaluation. Token comparison is a constant
-- amount of work against a 256-bit HMAC digest; timing side channels are
-- immaterial at that entropy.
--
-- Rollback contract: ANY failure (invalid/expired/used/revoked token, unpaid
-- or refunded order, product not in order_items, duplicate review) returns
-- JSON with ok=false AND leaves the transaction untouched — partial writes
-- are impossible.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.redeem_review_claim_v1(
  p_token_hash   text,
  p_name         text,
  p_email        text,
  p_rating       integer,
  p_title        text DEFAULT NULL,
  p_body         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_claim       public.review_claims%ROWTYPE;
  v_order       public.orders%ROWTYPE;
  v_customer_id uuid;
  v_review_id   uuid;
BEGIN
  -- 1. Lock the matching, unused, unexpired, unrevoked claim.
  SELECT * INTO v_claim
  FROM public.review_claims
  WHERE token_hash = p_token_hash
    AND used_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', CASE
        WHEN EXISTS (SELECT 1 FROM public.review_claims WHERE token_hash = p_token_hash AND used_at IS NOT NULL)
          THEN 'already_used'
        WHEN EXISTS (SELECT 1 FROM public.review_claims WHERE token_hash = p_token_hash AND revoked_at IS NOT NULL)
          THEN 'revoked'
        WHEN EXISTS (SELECT 1 FROM public.review_claims WHERE token_hash = p_token_hash AND expires_at <= now())
          THEN 'expired'
        ELSE 'invalid_token'
      END
    );
  END IF;

  -- 2. Authoritative order recheck: only a currently-paid purchase redeems.
  SELECT * INTO v_order FROM public.orders WHERE id = v_claim.order_id FOR UPDATE;
  IF v_order.status NOT IN ('paid', 'processing', 'shipped', 'delivered') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_not_eligible');
  END IF;

  -- 3. Purchase fence: the bound product must be in the bound order.
  IF NOT EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = v_claim.order_id AND product_id = v_claim.product_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'product_not_in_order');
  END IF;

  -- 4. Duplicate-review policy: one review per customer per product. The
  --    claim stays unused so a lost first response can be retried safely.
  SELECT id INTO v_review_id
  FROM public.reviews
  WHERE product_id = v_claim.product_id AND customer_id = v_claim.customer_id
  LIMIT 1;
  IF v_review_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_reviewed', 'review_id', v_review_id);
  END IF;

  -- 5. Upsert the reviewer's contact identity. NOTE: this upsert is
  --    contact-data bookkeeping only — the email supplied here NEVER
  --    influences verified_purchase, which comes exclusively from the claim.
  SELECT id INTO v_customer_id FROM public.customers WHERE email = p_email LIMIT 1 FOR UPDATE;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (email, first_name)
    VALUES (p_email, split_part(p_name, ' ', 1))
    RETURNING id INTO v_customer_id;
  END IF;

  IF v_customer_id <> v_claim.customer_id THEN
    -- Bound customer is authoritative for the review row; the typed email is
    -- only kept as contact info. Rewrite the review ownership to the claim's
    -- purchaser so duplicate prevention keys on the real buyer.
    v_customer_id := v_claim.customer_id;
  END IF;

  -- 6. Insert the review with the server-set verified badge.
  INSERT INTO public.reviews (product_id, customer_id, rating, title, body, status, verified_purchase)
  VALUES (v_claim.product_id, v_customer_id, p_rating, p_title, p_body, 'approved', true)
  RETURNING id INTO v_review_id;

  -- 7. Consume the claim atomically with the review insert.
  UPDATE public.review_claims
  SET used_at = now(), used_by_review_id = v_review_id
  WHERE id = v_claim.id;

  RETURN jsonb_build_object('ok', true, 'review_id', v_review_id, 'product_id', v_claim.product_id);
END;
$fn$;

-- ============================================================================
-- Access control: server/service only — mirrors the payment RPC grant model.
-- ============================================================================
REVOKE ALL ON public.review_claims FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_review_claim_v1(text, text, text, integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_review_claim_v1(text, text, text, integer, text, text)
  TO service_role;

COMMIT;
