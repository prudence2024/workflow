# PROPOSAL-ONLY — Secure Verified-Purchase Identity (Guest Purchase Authorization)

**Status: REVISED DRAFT FOR OWNER APPROVAL — supersedes the earlier Options A/B draft.**
**No SQL applied. No migration file created. No review behavior changed.**

Date: 2026-09-15 · Branch: `codex/diplomat-final-hardening` · Head at writing: `7b1e143` (unpushed docs commit; application HEAD `23ff9f5`)

---

## 0. Architecture constraint (Owner clarification, authoritative)

Diplomat Global customers **do not create accounts**. There is **no customer-facing Clerk
authentication** — Clerk guards `/dashboard` (admin) only. Guest checkout is the intended
customer architecture, permanently.

Consequently the earlier draft's **Option A (Clerk customer identity linkage) is NOT
APPLICABLE** to this product architecture. It is retained only as a historical appendix (§10)
so the reasoning trail exists; it must not be implemented, planned, or costed as part of this
work. There is no storefront sign-in to link to, and none is planned.

The active design is **GUEST PURCHASE AUTHORIZATION ONLY**: a dedicated per-product review
claim, delivered to the purchaser, proved by possession of a cryptographically random opaque
token — never by a typed email.

---

## 1. Proven problem (threat model)

`submitReview` (src/lib/reviews.server.ts) currently proves purchase like this:

1. Browser sends `customer_email` (+ name, rating, body, product_id).
2. Server upserts `customers` **by email** — the email *claim* creates the customer row.
3. Paid-order + `order_items` proof runs against that claimed customer.

Everything else is solid (pinned by `tests/review-spoof-contract.test.ts`):

- The browser can never submit a verified flag (`verified_purchase` is not in the validator).
- Verification is server-derived from `orders.status ∈ {paid, processing, shipped, delivered}`.
- An `order_items` row containing the reviewed product is required.
- Duplicates are idempotent per (customer, product); submissions are rate-limited.

**The single exploitable link is step 1→2:** reviewer identity is an email *claim*, not proof.
`EMAIL_USED_AS_PURCHASE_PROOF=YES` today — an attacker who knows a purchaser's email (order
confirmation emails, leaks, social engineering) obtains that purchaser's verified-review
privilege for every product the purchaser bought. The fix must make the email profile-only.

Environment facts that shape the design (verified in source/live DB, not assumed):

- `reviews` RLS is enabled with **zero policies and zero anon/authenticated grants** — all
  review access flows through serverFns over the postgres/service connection.
- A secure-token precedent exists: `receipts.download_token` (uuid, unique, queried
  server-side, delivered by email only). We reuse its **pattern**, never its token values.
- Transactional RPC precedent exists: `complete_verified_payment_v1/v2` (plpgsql, pinned
  `search_path = pg_catalog, public`).
- `orders.idempotency_key` (uuid, unique) exists; callback/webhook replay idempotency is
  already proven by the payment suites — issuance must ride the same rails.

---

## 2. Design goals

1. **Prove possession of a purchaser-delivered authorization**, not an email claim.
2. **No PII inside the URL token** — the token is pure randomness; everything meaningful
   (order, product, purchaser) is bound server-side.
3. **Raw token never stored** — only a keyed hash of it.
4. **Atomic consumption**: token redemption and review creation commit or roll back together.
5. **Idempotent issuance** that cannot multiply under callback/webhook replay.
6. Guest checkout stays the only flow; **no accounts, no Clerk, no new public endpoints**.
7. No browser-role grants; RLS posture identical to `reviews`/`orders`/`receipts`.
8. Backwards compatible: existing reviews keep their meaning; nothing breaks if the Owner
   does nothing further.

---

## 3. Token model — dedicated opaque guest review claim

### 3.1 Token type and entropy

- Raw token: **32 cryptographically random bytes** from `crypto.randomBytes(32)` →
  base64url (≈43 chars, **256-bit entropy**). No payload, no signature, no PII — an
  unguessable bearer capability, same shape class as `receipts.download_token` but at
  double the entropy.
- Delivery: **raw token appears exactly once — in the purchaser's receipt email**, as a
  per-product review link: `/products/{slug}?review_token=<raw>`. The slug is the product's
  public page path; no customer email, name, or order id appears anywhere in the URL.

### 3.2 Storage — hashed, never raw

- Server stores **HMAC-SHA256(raw_token, REVIEW_TOKEN_HASH_KEY)** — a keyed hash, so a
  database read-only leak cannot be brute-forced or rainbow-tabled offline.
- `REVIEW_TOKEN_HASH_KEY` is a **new server-only env var** (Owner-set). Reusing
  `PAYSTACK_SECRET_KEY` is explicitly **rejected** — payment secrets must not key
  non-payment capabilities. Timing-safe comparison via `crypto.timingSafeEqual`, the same
  primitive already used for Paystack signature verification.

### 3.3 Capability separation

- **Receipt download token and review claim token are different capabilities.** A receipt
  token authorizes reading a receipt PDF; a review claim authorizes exactly one verified
  review on exactly one product. Neither can be derived from the other, and no value is
  shared between them. We reuse only the *pattern* (random → email-delivered → server-side
  lookup → idempotent creation) and its helpers where safe.

### 3.4 Binding — one token, one purchase claim

Every claim row binds server-side, at issuance, to exactly:

- **`order_id`** — the finalized order
- **`product_id`** — one specific purchased product
- **`customer_id`** — the actual purchaser customer row resolved by checkout (never by a
  later typed email)
- **`token_hash`**, **`expires_at`**, **`used_at`**, **`revoked_at`**, **`created_at`**

Multi-product orders get one independent claim per line item: Product A, B, C → three
separate tokens. **A Product-A token can never verify Product B**: the RPC matches on the
stored `token_hash` and enforces `claim.product_id = submitted product_id` and
`order_items(order_id, product_id)` existence inside the same transaction — three
independent fences.

### 3.5 What possession proves — honest statement

The token proves **possession of the purchaser-delivered authorization link**, nothing more.
It does not biometrically prove a human identity; a forwarded or stolen email could be used
by its possessor (see §8 for the full disclosure and mitigations). Within the guest
architecture this is the strongest purchasable guarantee: compromising it requires the
purchaser's *mailbox*, not merely knowledge of their email.

---

## 4. Schema change (the only schema touch — additive table)

### 4.1 New table `review_claims`

```sql
-- PROPOSAL — NOT APPLIED. File would be, e.g., supabase/migrations/2026MMDD_review_claims.sql
CREATE TABLE IF NOT EXISTS public.review_claims (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_id      uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  token_hash       bytea NOT NULL,            -- HMAC-SHA256(raw token, REVIEW_TOKEN_HASH_KEY)
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,      -- created_at + 30 days (Owner-tunable)
  used_at          timestamptz,               -- set atomically by redeem_review_claim_v1
  used_by_review_id uuid UNIQUE REFERENCES public.reviews(id) ON DELETE SET NULL,
  revoked_at       timestamptz                -- admin revocation path (§7.3)
);

-- Idempotent issuance fence: at most ONE live claim per (order, product).
-- Callback/webhook/email-retry replays can never multiply active tokens.
CREATE UNIQUE INDEX IF NOT EXISTS review_claims_one_live_per_order_product
  ON public.review_claims (order_id, product_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;

-- Redemption lookup by keyed hash.
CREATE INDEX IF NOT EXISTS review_claims_token_hash_idx
  ON public.review_claims (token_hash);

ALTER TABLE public.review_claims ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies and NO anon/authenticated grants — identical to
-- reviews/orders/coupon_reservations posture: serverFn-only access via postgres/service_role.
```

Field rationale (Owner asked: only genuinely necessary extras): `used_by_review_id` gives the
audit trail binding claim→review (and a clean rollback/repair surface); `revoked_at` is the
Owner's abuse-control lever (§7.3). Nothing else.

### 4.2 Existing tables

**No changes.** No new columns on `customers`, `orders`, `products`, or `reviews`. Existing
indexes untouched. The claim table is purely additive and droppable.

### 4.3 RLS implications

Enabled, zero policies, zero browser grants — byte-for-byte the posture of `reviews`,
`orders`, `receipts`, `coupon_reservations`. Nothing weakened; nothing browser-reachable; the
browser receives no service-role capabilities. All redemption logic runs server-side through
the postgres/service connection inside one RPC call.

---

## 5. Atomic redemption — `redeem_review_claim_v1`

### 5.1 Why a single RPC

The naive sequence — `UPDATE review_claims SET used_at` **then** separately `INSERT review` —
has a crash/failure gap in both directions: a consumed claim with no review (lost privilege),
or a review with an unconsumed claim (replay window). The Owner's requirement is one
transaction: **steps 1–10 below commit or roll back together.**

### 5.2 Proposed RPC (plpgsql, `SECURITY DEFINER` on the reviews table because the web/postgres
role that serverFns use cannot write `review_claims` otherwise — following the pinned-
`search_path` convention of `complete_verified_payment_v*`; alternative is granting the
service connection direct table access, which is equally server-only)

```sql
-- PROPOSAL — NOT APPLIED
CREATE OR REPLACE FUNCTION public.redeem_review_claim_v1(
  p_review_token text,        -- raw token from the email link (server-only input)
  p_product_id   uuid,        -- product the review is being submitted for
  p_rating       int,
  p_title        text,        -- pre-sanitized by the app layer (sanitizeText)
  p_body         text,        -- pre-sanitized by the app layer
  p_display_name text,        -- display-only
  p_display_email text        -- display-only; NEVER used as purchase proof
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_hash        bytea;
  v_claim       public.review_claims%ROWTYPE;
  v_order       public.orders%ROWTYPE;
  v_review_id   uuid;
  v_verified    boolean;
BEGIN
  -- (1) hash presented token
  v_hash := hmac(convert_to(p_review_token, 'utf8'),
                 convert_to(current_setting('app.review_token_hash_key'), 'utf8'), 'sha256');

  -- (2) lock/retrieve matching unused claim (FOR UPDATE: concurrent redemptions serialize)
  SELECT * INTO v_claim
  FROM public.review_claims
  WHERE token_hash = v_hash
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  -- (3) verify not expired / already used / revoked
  IF v_claim.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_used');
  END IF;
  IF v_claim.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  END IF;
  IF v_claim.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  -- (3.5) scope fence: token is bound to the submitted product
  IF v_claim.product_id <> p_product_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'product_mismatch');
  END IF;

  -- (4) verify order still qualifies (re-checked at redemption time, not just issuance)
  SELECT * INTO v_order FROM public.orders WHERE id = v_claim.order_id FOR SHARE;
  IF v_order.status NOT IN ('paid','processing','shipped','delivered') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_not_qualifying');
  END IF;

  -- (5) verify order_items contains the bound product (defense-in-depth fence)
  IF NOT EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = v_claim.order_id AND product_id = p_product_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'product_not_in_order');
  END IF;

  -- (6) duplicate-review policy BEFORE any mutation: truthful duplicate, claim stays live
  IF EXISTS (
    SELECT 1 FROM public.reviews
    WHERE customer_id = v_claim.customer_id AND product_id = p_product_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate', 'duplicate', true);
  END IF;

  -- (7)+(8) create review; verified_purchase set SERVER-SIDE, never from browser input
  INSERT INTO public.reviews
    (product_id, customer_id, rating, title, body, display_name, display_email,
     verified_purchase, status)
  VALUES
    (p_product_id, v_claim.customer_id, p_rating, p_title, p_body,
     p_display_name, p_display_email,
     true, 'approved')
  RETURNING id INTO v_review_id;
  v_verified := true;

  -- (9) mark claim used / bind used_by_review_id (same transaction)
  UPDATE public.review_claims
     SET used_at = now(), used_by_review_id = v_review_id
   WHERE id = v_claim.id;

  -- (10) COMMIT (implicit at end; any error above aborts the whole operation)
  RETURN jsonb_build_object('ok', true, 'review_id', v_review_id,
                            'verified_purchase', v_verified);
END;
$$;
```

Notes:

- The `(column names in the INSERT)` are indicative; the materializer aligns them to the real
  `reviews` schema (status/display columns may differ) without changing the 10-step contract.
- `customer_id` on the created review is **the claim's purchaser row** — the reviewer's typed
  email is display data only and cannot redirect verification.
- Any failure at any step raises/returns before mutation ⇒ full rollback; a transient insert
  failure leaves the claim unconsumed and retryable.
- The key is delivered to the function via a `SET app.review_token_hash_key` session
  parameter from the serverFn connection (never stored in the table, never sent by the
  browser). Materialization will use the least-privilege variant of this plumbing.

### 5.3 ServerFn changes (server-only; no new public endpoints)

1. **Issuance — `payment-finalize.server.ts`, strictly post-finalization hook:** after a
   successful `complete_verified_payment_v*` return, for each eligible `order_items` row:
   mint raw token (`randomBytes(32)`), store HMAC hash, insert claim. **Idempotency fence:**
   the partial unique index (§4.1) makes a second live claim for `(order_id, product_id)`
   impossible — callback/webhook/payment-replay/email-retry hit `ON CONFLICT DO NOTHING` and
   return the existing live claim for re-delivery instead of minting anew. One token per
   order+product, ever, while live.
2. **Delivery — receipt email:** append one per-product "Review your purchase" link per
   claim, alongside the existing receipt-token link. **Finalization is never coupled to
   email success:** email send failure leaves the order paid, the receipt valid, and the
   claim live for retry delivery (re-delivery re-sends the SAME token; it never mints a new
   one).
3. **Redemption — `reviews.server.ts`:** the validator gains an optional `review_token`.
   Flow when present: rate-limit → sanitize content (app layer, unchanged) → call
   `redeem_review_claim_v1` → map `reason` to truthful user messages. Flow when absent:
   **unchanged legacy path** (see §9) — token-less submissions can no longer produce
   `verified_purchase: true` once the Owner flips the cutover flag (§7.1); before cutover
   they keep today's behavior so nothing breaks mid-rollout.
4. **Revocation — admin serverFn (additive):** `revokeReviewClaim(claimId)` sets
   `revoked_at`. Owner-side abuse lever; admin-only like all dashboard serverFns.

---

## 6. Review submission flows

### 6.1 Guest with token (the verified path)

Receipt email → per-product link → form pre-fills "Verified purchase available for this
product" state → submit (content + display email) → server rate-limits, sanitizes, calls the
atomic RPC → `verified_purchase: true` bound to the true purchaser row. Lost/deleted email ⇒
write a normal unverified review (graceful degradation, current UX preserved).

### 6.2 Guest without token (legacy/degraded path)

Exactly today's flow minus verification (post-cutover): review is accepted and published as
`verified_purchase: false`. Email is profile data. The email-claim-to-verified path is
closed; rate-limiting and duplicate guards are unchanged.

### 6.3 Logged-in customer compatibility

**N/A — by architecture.** Customers do not have accounts; there is no logged-in customer
path to design for. (Clerk linkage, were it ever introduced, would be a separate proposal —
see §10.)

### 6.4 Guest checkout compatibility

Full, by design: issuance keys off `order_items` + `customers` rows that guest checkout
already creates; nothing in checkout changes.

---

## 7. Lifecycle policies

### 7.1 Refund / reversal matrix (explicit)

| Scenario | Claim/review behavior |
| --- | --- |
| Payment **failed / cancelled / unpaid** | No finalization ⇒ **no claim ever issued**; can never qualify. |
| **Full refund before review** (claim still live) | Redemption re-checks order status (§5.2 step 4): refunded status ∉ qualifying set ⇒ **claim cannot create a Verified Purchase review**. Owner may also revoke the claim for immediate link-dead effect. |
| **Full refund after review published** | **Owner policy decision — not decided unilaterally.** Options: (a) review stays, verified badge stays (purchase was real at review time — recommended default), (b) review stays, badge drops, (c) review is hidden. Requires only an admin action/flag; the schema supports any of the three without migration. |
| **Partial refund** | Verified for the **non-refunded item's claim** (per-product binding makes this natural); a fully refunded product's claim hits the same gate as "full refund before review". |
| **Payment reversal / chargeback** (if supported later) | Same treatment as full refund before review at redemption time; post-publication handling = same Owner decision row as above. |
| **Order cancelled post-payment pre-shipment** | Status-based gate handles it; claim cannot verify a cancelled order. |

### 7.2 Expiry

`expires_at = created_at + 30 days` (proposal; Owner-tunable constant). Expired ⇒ truthful
"this review link has expired" and the claim is inert. Expired rows are pruneable by the
existing cleanup patterns; pruning never affects published reviews.

### 7.3 Replay prevention & revocation

- Replay: atomic `FOR UPDATE` consumption + `used_at` in the same transaction ⇒ a second
  redemption of the same token returns `already_used`, exactly-once under any concurrency
  (verified by the concurrent-submit test in §11).
- Revocation: `revoked_at` set by the admin serverFn ⇒ link dead instantly, even if unused
  and unexpired.

### 7.4 Duplicate reviews

Unchanged rule — one review per (customer, product). With a token, the duplicate check runs
**before any mutation** inside the RPC: the claim stays live, the user gets the truthful
"already reviewed" outcome, and no privilege is burned.

---

## 8. Forwarded-link risk — honest disclosure

A guest magic-link model means **possession of the token grants the review claim**. A
forwarded or stolen email link could be redeemed by its possessor. **We do not claim
cryptographic tokens prove the physical human identity — they prove possession of the
purchaser-delivered authorization link.**

Mitigations that bound this risk (all included in this design):

1. **256-bit cryptographically random token** — unguessable, no offline attack.
2. **Moderate expiry (30 days, Owner-tunable)** — bounded window.
3. **One-time use** — atomic consumption; a redeemed link is dead.
4. **Product/order binding** — a stolen link verifies only that one product on that one order.
5. **Server-side status recheck** — refunded/cancelled orders cannot verify even with a live
   link.
6. **Revocation support** — the Owner can kill any claim on report/abuse.

Residual risk accepted by design: an attacker with sustained access to the purchaser's
mailbox within the expiry window. This is the same exposure class as the receipt-download
link and every guest magic-link system; closing it further would require customer accounts,
which the architecture excludes.

---

## 9. Privacy, backwards compatibility, rollout, rollback

### 9.1 Privacy

- **No PII inside the URL token** — the token is opaque randomness; order/product/customer
  binding lives server-side only.
- Raw token never persisted; only the keyed HMAC hash.
- The claim row adds no new PII class beyond FK ids (already in `orders`/`customers`); the
  reviewer's display email is stored once, in `reviews`, as today.
- Token in email bodies = same exposure class as existing receipt links, bounded by expiry.

### 9.2 Backwards compatibility for existing reviews

- Every existing review keeps its meaning; nothing is recomputed or migrated.
- `review_claims` starts empty; historical purchases issue no retroactive claims (option to
  backfill for recent orders is a separate Owner decision, not part of this design).
- Token-less submission path remains functional throughout (§6.2) — pre-cutover it keeps
  today's verified-from-email behavior; post-cutover it publishes unverified reviews. The
  cutover flag is explicit and Owner-controlled.

### 9.3 Rollout strategy (each step independently deployable)

1. Migration (additive table + indexes + RPC) — inert until code uses it.
2. Token module + issuance hook + receipt-email links (claims minted; links live; redemption
   not yet wired) — observable, reversible.
3. Redemption path in `submitReview` behind the cutover flag (tokens verify; email path
   still legacy).
4. Owner flips cutover: email-claim-to-verified closed.
5. (Optional, later) prune-expired-claims cleanup cadence.

### 9.4 Rollback strategy

- Stop appending email links + ignore `review_token` (one-line each); claims stay dormant
  data.
- Drop the additive table (`DROP TABLE public.review_claims;` + function) — zero impact on
  reviews, orders, customers. No data migration back; nothing to un-mix.

---

## 10. Appendix — Option A (Clerk linkage): NOT APPLICABLE

Recorded for the reasoning trail only; **excluded from the plan by Owner architecture
decision** (no customer accounts, Clerk admin-only, guest checkout is the intended customer
architecture). Its earlier full write-up (schema `customers.clerk_user_id`, checkout
write-back, signed-in review resolution) remains in git history (`7b1e143`). It would not
have closed the guest hole — guests are the only customer kind — so it fails the design goal
even before its infrastructure cost (a storefront sign-in surface) is considered. Do not
resurrect without a new Owner directive.

---

## 11. Required test matrix (on approval, before any apply)

Redemption/atomicity (new, `redeem_review_claim_v1` contract tests):

1. Valid token + matching product ⇒ `ok:true`, `verified_purchase:true`, review bound to
   claim's customer, claim marked used with `used_by_review_id` link.
2. Wrong/unknown token ⇒ `invalid_token`, nothing mutated.
3. Expired token ⇒ `expired`, claim not consumed.
4. Revoked token ⇒ `revoked`, claim not consumed.
5. Replay (sequential) ⇒ second use `already_used`.
6. Replay (concurrent parallel submits) ⇒ exactly one success — race test, 0 skips.
7. **Product-scope fence:** Product-A token submitted for Product B ⇒ `product_mismatch`,
   nothing consumed.
8. Order refunded/cancelled between issuance and redemption ⇒ `order_not_qualifying`.
9. Duplicate review with valid live token ⇒ truthful `duplicate`, **claim stays live**.
10. Injected failure after claim lock ⇒ full rollback (no used claim, no review).
11. Reviewer types a different email than the purchaser's ⇒ still verified (proof is the
    token), display email stored as profile data.
12. Browser-submitted `verified_purchase` still stripped/ignored (existing suite holds).

Issuance:

13. Finalization mints one live claim per order-item; multi-product order ⇒ independent
    per-product tokens.
14. Idempotency: repeated callback/webhook/replay ⇒ no second live claim (unique fence);
    re-delivery re-sends the same token.
15. Email-provider failure ⇒ finalization still succeeds; order paid; receipt valid; claim
    live for retry delivery.
16. Product-A token never appears in Product-B's email link (delivery mapping test).
17. Raw token never written to DB/logs (hash-only storage assertion).

Regression:

18. Coupon-reservation + finalizer v1/v2 suites stay green (issuance strictly
    post-finalization, non-blocking).
19. Cross-checkout + `review-spoof-contract` suites unchanged behavior pre-cutover.

---

## 12. Approval gate

- `OWNER_APPROVAL_REQUIRED=YES` — nothing below happens without it.
- No SQL applied or staged; no migration file created; no runtime review behavior changed;
  the diff for this revision is this document only.
- On approval: materialize migration + token module + issuance hook + RPC + test matrix,
  run the full gate sequence (tests/typecheck/lint/build/serverFn integrity) with the same
  preflight/recovery discipline used for the coupon migrations, then implement.

**RETURN BLOCK**

```
CUSTOMER_ACCOUNT_REQUIRED=NO
CLERK_REQUIRED=NO
EMAIL_USED_AS_PURCHASE_PROOF=NO
TOKEN_TYPE=opaque cryptographically random bearer capability (crypto.randomBytes(32), base64url, no payload, no PII)
TOKEN_STORED_RAW=NO
TOKEN_HASH_STORAGE=HMAC-SHA256(raw token, REVIEW_TOKEN_HASH_KEY) as bytea in review_claims.token_hash; timing-safe compare
TOKEN_ENTROPY=256-bit (32 random bytes)
RECEIPT_TOKEN_REUSED=NO
RECEIPT_TOKEN_PATTERN_REUSED=YES — random→email-delivered→server-side lookup→idempotent creation pattern and helpers only; separate token, separate capability
TOKEN_BINDS_ORDER=YES
TOKEN_BINDS_PRODUCT=YES
TOKEN_BINDS_CUSTOMER=YES
ATOMIC_REVIEW_AND_CONSUMPTION=YES — single plpgsql transaction: lock claim → verify expiry/revocation/order-qualifies/order_items → duplicate policy → insert review (verified server-side) → mark used → COMMIT; any failure rolls back everything
PROPOSED_RPC=redeem_review_claim_v1 (public.review_claims + public.reviews, SECURITY DEFINER, pinned search_path, following complete_verified_payment_v* convention)
SCHEMA_CHANGE_REQUIRED=YES — one additive table (review_claims) + two indexes + one RPC; no existing-table changes
REVISED_MIGRATION_PROPOSAL=see §4.1 (proposal SQL only, NOT applied; no migration file created)
FULL_REFUND_BEFORE_REVIEW_POLICY=claim cannot create a Verified Purchase review — redemption re-checks order status inside the RPC; optional admin revoke for instant link-dead effect
FULL_REFUND_AFTER_REVIEW_OWNER_DECISION=review retention/badge/hidden is presented as an Owner policy choice (§7.1 row 3); schema supports all three options without further migration; recommended default (a) review stays, badge stays
FORWARDED_TOKEN_RISK=real and disclosed — possession of the email link grants the claim; mitigated by 256-bit randomness, 30-day expiry, one-time atomic use, order+product binding, server-side status recheck, admin revocation; does NOT prove human identity, only purchaser-delivered authorization possession
OWNER_APPROVAL_REQUIRED=YES
```
