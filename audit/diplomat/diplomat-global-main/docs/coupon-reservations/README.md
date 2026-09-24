# Coupon Reservations — Owner-Gated Design v3 (final rollout correction)

**§0 canonical metadata key (resolved): `financial_finalization_version`.**
Verified in `payment-rollout.server.ts`, the `PaymentQuoteMetadata` type,
`isFinancialFinalizationV1()`, and the live v1 RPC binding check
(`t.metadata->>'financial_finalization_version'`). v2 extends THIS key with
value 2; no second key is introduced and historical metadata is not renamed.
(An earlier draft's `financial_finalizer_version` spelling was an error and has
been removed everywhere; v2's body also now REJECTS non-2 markers instead of
inheriting v1's `!= '1'` check, which would have wrongly rejected v2 payments.)

**Status: PROPOSAL ONLY. Nothing applied. No shared-DB mutation in this run.**

Files:
- [`PROPOSED.sql`](./PROPOSED.sql) — STEP A: table + reserve/release RPCs
- [`PROPOSED-STEP-B-CONVERSION.sql`](./PROPOSED-STEP-B-CONVERSION.sql) — STEP B **v3**: versioned `complete_verified_payment_v2` + healing helper. **v1 is preserved byte-for-byte — V1_CHANGED=NO.**
- [`ROLLBACK.sql`](./ROLLBACK.sql) — drops v2 first; v1 remains available throughout

v3 correction applied: because Preview and Production share ONE Supabase
database, a Vercel env flag cannot protect Production from a replaced function
body. STEP B therefore no longer touches `complete_verified_payment_v1` — it
adds a versioned `complete_verified_payment_v2` (same argument shape as v1) and
a healing helper. Flag routing picks the function, not the schema.

---

## 1. Live schema (read-only inspection — unchanged from v1 finding)

```
LIVE_COUPON_SCHEMA=public.coupons (20260827_baseline.sql:223): id uuid PK,
  code text UNIQUE, discount_type CHECK('fixed','percentage'),
  discount_value numeric(12,2) CHECK>0, active bool DEFAULT true,
  starts_at/expires_at timestamptz, max_uses int CHECK>0 (NULL=unlimited),
  uses int DEFAULT 0 CHECK>=0; RLS enabled.
COUPON_USAGE_COLUMNS=uses (consumed) + max_uses (capacity)
CURRENT_COUPON_FUNCTIONS=complete_verified_payment_v1 (Owner-applied from
  docs/payment-finalization/PROPOSED.sql) — canonical financial boundary:
  locks order→transaction→items→coupon FOR UPDATE, validates the full
  binding chain, enforces uses<max_uses, uses=uses+1, marks paid/successful,
  inserts payment_financial_completions.
```

## 2. Concurrency mechanism — CORRECTED

`CHOSEN_LOCKING_MECHANISM=` single-row `SELECT … FOR UPDATE` on the coupon
row, held while: window/status re-check → `uses`/`max_uses` read →
`COUNT(state='reserved' AND expires_at>now())` → replay/resurrection reuse →
conditional INSERT. A second probe runs AFTER the lock so a same-attempt twin
that commits during the lock wait is recognized as a replay, never misreported
as `exhausted`.

### 2a. Coupon-switch lifecycle — UNIQUE design (v4 correction)

Owner question: can a checkout attempt legitimately change coupons after its
reservation is released? Verified application lifecycle (`checkout.server.ts`):

- Order reuse requires an **exact quote match including coupon**
  (`canReuseCheckoutOrder` → `orderMatchesQuote`).
- If the browser replays attempt X with a **different coupon**, the quote no
  longer matches → `existingOrder` is truthy but reuse fails → the server
  **mints a fresh attempt id Y** (`checkout.server.ts:341`) and marks the old
  order `abandoned`. So a coupon CHANGE always arrives under a new attempt id.
- A SAME-coupon retry after decline/cancel/abandon **does** reuse attempt X.

Distinguishing the Owner's two concepts:

```
ONE_ACTIVE_COUPON_PER_CHECKOUT=TRUE  (DB-enforced by the partial unique index)
ONE_COUPON_EVER_PER_CHECKOUT_ATTEMPT=FALSE (deliberately: released/expired
  rows are history and must never block a legitimate retry)

CHECKOUT_ATTEMPT_REUSED_AFTER_COUPON_CHANGE=NO (app mints Y)
COUPON_CHANGE_AFTER_RELEASE_SUPPORTED=YES (new coupon → new attempt id → new
  reservation row; old row remains as history)
CURRENT_UNIQUE_CONSTRAINT_SAFE=NO for bare UNIQUE(checkout_attempt_id) — a
  same-coupon retry after release would hit the unique index even though the
  slot is free. Corrected to the two-constraint design below.

WHY=this combination gives: (a) full audit history per (coupon, attempt);
(b) a hard DB guarantee that one attempt never holds two ACTIVE reservations,
regardless of application bugs; (c) same-coupon retries resurrect the released
row (CAS + capacity re-check + fresh TTL) instead of being blocked; (d) racing
same-attempt reserves converge on one row via the unique_violation handler.
```

`WHY=`
- **The Owner's objection to SERIALIZABLE is correct and accepted.** A plpgsql
  function does not open an independent child transaction with its own
  isolation lifecycle — it runs inside the caller's transaction, and the real
  invocation path (supabase-js → PostgREST → function call) runs **READ
  COMMITTED**. An in-function 40001 retry was therefore unprovable: the retry
  could not start a genuinely new serializable transaction, and an abort inside
  an already-tainted transaction cannot simply continue. That model is retired.
- `FOR UPDATE` on the coupon row needs **no** isolation-level assumption:
  under READ COMMITTED, once writer W1 holds the coupon lock, writer W2 blocks
  at its own `SELECT … FOR UPDATE` until W1 commits, then reads the committed
  state fresh (READ COMMITTED takes a new snapshot per statement). The
  count→insert critical section is therefore serialized **per coupon** with no
  retry logic to prove.
- Reserve is a lock **leaf** (takes only the coupon row); finalize takes
  order → transaction → items → coupon → reservation; release takes
  coupon → reservation. One consistent global order → no deadlock cycle.

```
UNRELATED_COUPONS_BLOCKED=NO   (different coupon rows = different locks)
LAST_SLOT_DOUBLE_RESERVATION_POSSIBLE=NO
  (both capacity-affecting writers — reserve, finalize-conversion, release —
   hold the same coupon-row lock across their read+write; the second tab
   observes the first's committed reservation and gets {reserved:false,'exhausted'})
```

`RESERVATION_SCHEMA=` `coupon_reservations(id uuid PK, coupon_id uuid NOT NULL
FK→coupons ON DELETE RESTRICT, checkout_attempt_id uuid NOT NULL,
reference text NULL, order_id uuid NULL FK→orders ON DELETE SET NULL,
state text CHECK('reserved','converted','released') + terminal-shape CHECK,
reserved_at NOT NULL, expires_at NOT NULL, converted_at, released_at)`

`FINAL_RESERVATION_UNIQUE_CONSTRAINT=` **UNIQUE(coupon_id,
checkout_attempt_id)** + **partial UNIQUE(checkout_attempt_id) WHERE
state='reserved'** (v4 correction — see §2a).

`RESERVATION_UNIQUE_INVARIANT=` ONE ACTIVE reservation per checkout attempt,
DB-enforced by the partial unique index; full history retained per
(coupon, attempt).

## 3. Binding model

```
RESERVATION_CREATED_WITH=checkout_attempt_id — the app calls
  reserve_coupon_use_v1 AFTER the checkout flow determines the order's final
  attempt id (reuse path keeps the browser id; the stale-attempt path mints a
  new one). The reservation is therefore always created with the order's
  authoritative attempt id.
REFERENCE_BOUND_WHEN=at conversion, inside the finalize transaction
  (STEP B sets reference = p_reference). No intermediate binding write.
ORDER_BOUND_WHEN=at conversion, same transaction (order_id = o.id).
REBIND_AUTHORITY=NONE post-creation — no RPC or grant path updates
  checkout_attempt_id, coupon_id, or state from the browser; all transitions
  are server-side, service-role only, and CAS-guarded.
```

## 4. One canonical transaction (v2)

`V2_COUPON_CONVERSION_ATOMIC=YES`
`CRASH_GAP_BETWEEN_CONSUME_AND_CONVERT=NO`

Inside `complete_verified_payment_v2` (single transaction, before COMMIT):
lock order → lock transaction → lock items → **lock coupon → lock reservation**
(lookup by `o.checkout_attempt_id`, `state='reserved'`, FOR UPDATE) → verify
provider + immutable quote (unchanged block) → idempotency probe (unchanged) →
then atomically: `coupon.uses += 1` (or late-success audit path) → reservation
`reserved→converted` (+ reference/order_id backfill) → `order→paid` →
`payment_transactions→successful` → insert `payment_financial_completions` →
COMMIT. A crash anywhere before COMMIT leaves everything unconsumed; the
existing already-complete probe makes the retry safe. **No consume-then-COMMIT-
then-convert split exists.**

Capacity-consistency note: reserve counts `uses + active_reservations`; finalize
flips a reservation to `converted` in the same statement-sequence that
increments `uses` (both under the coupon lock) — the sum never double-counts or
under-counts a single redemption.

### 4a. Already-complete healing (v2 idempotent repair)

Scenario: a reservation exists for `checkout_attempt_id`, but the order was
already financially completed — potentially by the **v1 path** during rollout.
v2's already-complete branch (and the standalone `heal_coupon_reservation_v1`
helper it invokes) must never: increment the coupon again, mutate inventory
again, create another completion, or create another receipt. It may ONLY flip a
still-`reserved` reservation to `converted` when authoritative evidence proves
the order completed using that coupon/checkout:

- evidence = an existing `payment_financial_completions` row for the order
  (locked order row), reached via the order's `checkout_attempt_id`;
- the reservation's `coupon_id` must equal the completed order's `coupon_id`
  (mismatch → no heal; the row simply expires by TTL);
- heal is CAS (`state='reserved'` → `converted`), single-statement, replay-safe.

```
ALREADY_COMPLETE_LEDGER_DELTA=0
ALREADY_COMPLETE_COUPON_USE_DELTA=0
ALREADY_COMPLETE_INVENTORY_DELTA=0
ALREADY_COMPLETE_RESERVATION=converted (evidence-checked; no-op otherwise)
```

### 4b. Cross-version race safety (v1 ∥ v2, same order)

Both finalizers begin by locking the same order row and both gate on the
`payment_financial_completions` PK (`order_id`) probe held under that lock;
both increment the coupon under the SAME coupon-row lock with the same
`uses < max_uses` precondition:

- **v1 wins first** → v2 replay: probe finds the completion row → returns
  `{complete:true, already_complete:true}` and **heals** the still-`reserved`
  reservation (§4a). One completion, one coupon increment, one inventory
  mutation, reservation eventually converted.
- **v2 wins first** → v1 replay: v1's probe finds the completion row → returns
  `{complete:true, already_complete:true}` — zero deltas, no v1-side
  reconstruction needed (v1 is untouched).
- Exactly one financial completion / inventory mutation / coupon increment /
  paid order in every interleaving.

## 5. Release policies & TTL

Release RPC `release_coupon_reservation_v1(p_reservation_id uuid)` — CAS
`reserved→released` under the coupon-row lock. Called by the app **only for
authoritative outcomes**:

| Outcome | Action |
|---|---|
| authoritative `declined` (failure_kind='declined') | release immediately |
| authoritative `failed` (transport verified non-success) | release immediately |
| definitive provider `cancelled`/`abandoned` status (known now) | release immediately |
| unknown provider state / network ambiguity | **DO NOT release** — reservation stays until TTL |
| checkout abandoned / attempt stale / reservation expired | TTL covers; optional cosmetic cron sweep may mark rows released |

`TTL=30 minutes` (`= CHECKOUT_ATTEMPT_TTL_MS`). Active iff
**`state='reserved' AND expires_at > now()`** — predicate-based (R4): cleanup
jobs are never required for correctness; the sweep can only mark already-expired
rows for hygiene.

## 6. Late provider success (explicit model)

`LATE_PROVIDER_SUCCESS=` Reservation expired and the final slot went to another
shopper, then the original Paystack reference returns SUCCESS:
- provider truth + immutable quote are honored — finalize normally (order paid,
  ledger once, receipt created);
- the coupon-capacity failure is **not** fatal in this path: STEP B converts the
  capacity failure into the audit path instead of
  `RAISE EXCEPTION 'Coupon requires reconciliation'` when the payment binding
  is otherwise valid and provider-verified;
- no rejection of a charged customer; order never left pending.

`OVER_REDEMPTION_AUDIT=` `audit_logs` event
`payment.coupon_over_redemption` (reference, coupon_id,
reason ∈ `late_success_after_capacity_loss | no_reservation_pre_feature`) —
mirrors the already-implemented `payment.coupon_last_use_race` event.

`AUTO_REFUND=NO`

## 7. Unlimited coupons

`UNLIMITED_COUPON_RESERVATION_REQUIRED=NO` — no capacity invariant exists when
`max_uses IS NULL`, so reserve returns `{reserved:true, unlimited:true}`
without inserting a row: no contention, no rows, no sweep load. (Should a
future invariant require per-checkout unlimited tracking, that is a separate
Owner-gated design.)

## 8. Security model

```
RLS=ENABLED + FORCE RLS (owners included)
GRANTS=
  coupon_reservations:  REVOKE ALL FROM PUBLIC, anon, authenticated;
                        GRANT SELECT, INSERT, UPDATE TO service_role;
  reserve_coupon_use_v1(text,uuid,timestamptz):
                        REVOKE ALL FROM PUBLIC, anon, authenticated;
                        GRANT EXECUTE TO service_role;
  release_coupon_reservation_v1(uuid):
                        REVOKE ALL FROM PUBLIC, anon, authenticated;
                        GRANT EXECUTE TO service_role;
  complete_verified_payment_v2(uuid,text,bigint,text,timestamptz):
                        REVOKE ALL FROM PUBLIC, anon, authenticated;
                        GRANT EXECUTE TO service_role;
  heal_coupon_reservation_v1(uuid):
                        REVOKE ALL FROM PUBLIC, anon, authenticated;
                        GRANT EXECUTE TO service_role;
  complete_verified_payment_v1 — UNTOUCHED; its existing grants remain exactly
                        as currently applied (V1_CHANGED=NO).
```

SECURITY INVOKER proof (no generic DEFINER financial function):
- The DB client is created only in `src/lib/database.server.ts`, which imports
  `@tanstack/react-start/server-only` (verified) — browser bundles cannot
  import it. The app connects with the service-role key, i.e. the functions'
  invoker is service_role, which holds the EXECUTE grants above.
- The only `.rpc()` call sites are server modules (e.g.
  `payment-finalize.server.ts:470`). No browser-reachable surface calls these
  functions; even a direct anon call would fail — anon/authenticated hold
  neither EXECUTE nor any table privilege, so the INVOKER body has no authority.
- No caller-controlled SQL/object names; inputs are narrow (code text,
  uuid, server-chosen timestamptz validated inside the function).

## 9. Feature flag — environment-scoped routing (CORRECTED in v2/v3)

Shared `site_settings` is rejected (Preview/Production share the DB). And
because the flag gates **which function the app calls** (not schema), the
shared-DB concern is fully contained: v1 is never replaced, so a mis-routed
Production request would still execute the untouched v1 finalizer.

```
FEATURE_FLAG_LOCATION=Vercel/application environment variable
  COUPON_RESERVATIONS_V1_ENABLED
PREVIEW_VALUE=true
PRODUCTION_VALUE=false (until Preview acceptance, then true)
CROSS_ENVIRONMENT_LEAK_POSSIBLE=NO (env-scoped per deployment; nothing in the
  shared DB gates behaviour)
```

### 9a. Payment-protocol stickiness — the version follows the PAYMENT (v4 correction)

The env flag decides which flow **NEW checkouts** use; it must never decide how
an **existing** payment finalizes — callback and webhook may execute on
different deployments whose flags disagree. The repo already has the correct
mechanism, verified in source:

- `payment-rollout.server.ts` stamps attempt metadata at creation:
  `financial_finalization_version: 1` when its creation gate is on, with the
  comment "Creation gate only. Existing v1 attempts must never fall back."
- `payment-finalize.server.ts` routes on
  `isFinancialFinalizationV1(transaction.metadata)` — i.e. it reads the
  **authoritative DB row**, not the environment.

v2 extends this existing pattern (no new column —
`SCHEMA_CHANGE_FOR_FLOW_VERSION=NO`):

```
FLOW_VERSION_STORAGE=payment_transactions.metadata.financial_finalization_version (jsonb; server-authored)
FLOW_VERSION_WRITTEN_WHEN=at payment-attempt creation, AFTER a successful
  reservation (flag=true path) — BEFORE redirecting the customer to Paystack
FLOW_VERSION_WRITTEN_BY=server checkout serverFn (createPaymentAttempt), from
  process env; never from any browser field
BROWSER_CAN_CONTROL_FLOW_VERSION=NO (metadata is built server-side; the browser
  supplies only items/customer/coupon — never metadata)
```

Selector rules (single server module,
`src/lib/payment-finalizer-selector.server.ts`):

```
NEW_CHECKOUT_SELECTOR=
  flag=false → no reservation, marker absent → v1 (exact current behaviour)
  flag=true  → reserve_coupon_use_v1 (fail-closed) → marker=2 → v2
EXISTING_PAYMENT_SELECTOR=
  metadata.financial_finalization_version === 2 → complete_verified_payment_v2
  marker absent or 1 (or any other value)     → complete_verified_payment_v1
FLAG_CHANGE_DURING_PAYMENT_SAFE=YES (a created payment finalizes per its own
  marker on every deployment; the flag only gates NEW checkouts)
PAYMENT_PROTOCOL_STICKY=YES
```

Cross-deployment scenarios (all covered by the DB-marker rule):

| Scenario | Outcome |
|---|---|
| A. Preview flag=true creates v2 payment; flag later flips false; callback arrives | still v2 (marker) |
| B. v2 payment's webhook lands on a deployment whose creation flag=false | still v2 (marker) |
| C. old v1 payment, Preview flag=true, callback replay | still v1 (marker=1) |
| D. old payment with no marker | safely v1 |
| E. browser attempts to specify v2 (`?v=2`, header, payload, cookie) | ignored — metadata is server-authored; authoritative DB value wins |

`CALLBACK_AND_WEBHOOK_SHARE_SELECTOR=YES` — both funnel through
`finalizePayment`, which resolves the RPC name ONLY from the transaction's
stored marker.

### 9b. Reservation failure must FAIL CLOSED (v4 correction)

When the flag is ON and a LIMITED coupon requires a reservation, any
reservation-path failure must NOT fall back to initializing Paystack with the
discounted quote under v1 — that would recreate the race:

```
RESERVATION_ERROR_FALLBACK_TO_V1=NO
FAIL_CLOSED_BEFORE_PAYSTACK_INIT=YES
```

Concretely in `initializeCheckout`: if `reserve_coupon_use_v1` throws, times
out, returns `{reserved:false}` for any reason, or returns an unexpected shape,
initialization **stops** — no Paystack call, no order mutation. Customer keeps
the cart, the form draft, and a truthful retry message ("We couldn't secure
your coupon just now — please retry in a moment."), identical in spirit to the
existing quote-failure path (`canSubmitCheckout` gates on quote availability,
not error). Unlimited coupons follow their documented no-reservation path and
are unaffected. Only `{reserved:true}` (fresh, replay, or resurrected) permits
discounted Paystack initialization.

## 10. Exact migration package

```
PROPOSED_MIGRATION_FILENAME=
  supabase/migrations/20260914120000_coupon_reservations.sql            (STEP A)
  supabase/migrations/20260914120100_payment_finalization_v2.sql        (STEP B v3)
V1_CHANGED=NO
PROPOSED_SQL_UPDATED=YES
```

Function signatures (exact):
- `reserve_coupon_use_v1(p_code text, p_checkout_attempt_id uuid, p_expires_at timestamptz) RETURNS jsonb`
- `release_coupon_reservation_v1(p_reservation_id uuid) RETURNS jsonb`
- `complete_verified_payment_v2(p_transaction_id uuid, p_reference text, p_amount_kobo bigint, p_currency text, p_verified_at timestamptz) RETURNS jsonb` — **same argument shape as v1**; deltas from v1 marked `[V2-1]/[V2-2]/[V2-3]`
- `heal_coupon_reservation_v1(p_order_id uuid) RETURNS jsonb`
- **`complete_verified_payment_v1` — UNTOUCHED** (byte-for-byte; no CREATE OR REPLACE in this package)

Rollback/recovery: `ROLLBACK.sql` — drops v2 + healing helper FIRST, then
reserve/release, then the table. **`ROLLBACK_PRESERVES_V1=YES`: v1 is never
replaced, so rollback never reconstructs any body.**

## Drift reconciliation (2026-09-14, apply-time run)

The live v1 body (sha256 `d115c1a7262c4865840434860a2c7c5a85ab0c7503b9afd5b6c5e3e3e4433c38`,
captured in `.freebuff/db-checkpoints/`) proved **stronger** than the
`docs/payment-finalization/PROPOSED.sql` copy this design was originally derived from:
live v1 additionally enforces the item-snapshot invariants (`product_id`/`quantity`/
`line_total`/`sum(line_total)=subtotal` → 'Order snapshot rejected'), stronger
conflicting-completion checks (quote equality, payment_reference, order/transaction
status gates), and the general historical-state guard. STEP B was rewritten so v2 is
statement-for-statement derived from the **live** v1 text, differing only by the marked
[V2-1]/[V2-2]/[V2-3] deltas and the marker `'1'`→`'2'` acceptance. Verified by
`.freebuff/db-checkpoints/v1-vs-v2-diff.txt`.

## 11. Apply-time procedure (documented for the NEXT run — NOT executed)

Exact order, Owner present, each step verified before the next:

1. **Read-only schema preflight** — confirm no live objects named
   `coupon_reservations`, `reserve_coupon_use_v1`, `release_coupon_reservation_v1`,
   `complete_verified_payment_v2`, `heal_coupon_reservation_v1`.
2. **Capture live v1 prosrc** —
   `SELECT prosrc FROM pg_proc WHERE proname='complete_verified_payment_v1';`
   (byte-exact; this is the rollback-free guarantee anchor).
3. **Compare live v1 vs the v2 source base** — the doc copy of v1
   (`docs/payment-finalization/PROPOSED.sql`) must match the live body; any
   drift is reconciled into v2 BEFORE apply (v1 itself is never modified).
4. **Logical export / recovery checkpoint** — Owner pg_dump (schema +
   coupon/reservation-relevant data); Free-tier caution noted.
5. **Apply STEP A** (`20260914120000_coupon_reservations.sql`).
6. **Verify STEP A** — table + 2 RPCs + partial unique indexes + RLS/FORCE +
   grants (`\dp`-equivalent catalog queries).
7. **Apply STEP B** (`20260914120100_payment_finalization_v2.sql`).
8. **Verify v1 unchanged** — re-capture `prosrc`, must equal step 2 byte-for-byte.
9. **Verify v2 + healing helper** — signatures, SECURITY INVOKER, search_path,
   grants; no anon/authenticated execute.
10. **Smoke-test reservations with safe test data** — a disposable test coupon:
    reserve → replay → concurrent second attempt (exactly one wins) → release →
    resurrect → convert; then delete the test data.
11. **Implement application wiring** —
    `payment-finalizer-selector.server.ts` (marker-based),
    `initializeCheckout` fail-closed reserve call, marker stamping
    (`financial_finalization_version: 2`) at attempt creation after successful
    reservation, `finalizePayment` resolving the RPC from the marker only.
12. **Activate race tests** — remove the skipped defect test; enable the full
    §12 matrix (incl. cases 17–31) against the real RPCs.
13. **All gates** — focused tests, TypeScript, changed-file lint,
    `git diff --check`, full tests, build, serverFn integrity; then Preview
    deployment with `COUPON_RESERVATIONS_V1_ENABLED=true`; run the §12 matrix
    on Preview before any Production flag flip.

### 11a. Paystack webhook routing audit (Owner invariant 1 — evidence)

Audited from repo evidence (`docs/OWNER-FINAL-TESTS.md`, `paystack.server.ts`,
`site-origin.server.ts`):

```
PAYSTACK_TEST_WEBHOOK_TARGET=a SINGLE static URL configured in the Paystack
  dashboard (deployment-wide, not per payment). Repo docs instruct:
  https://<preview-url>/api/webhook/paystack?x-vercel-protection-bypass=<SECRET>
  (Vercel deployment protection requires the bypass parameter).
PAYSTACK_LIVE_WEBHOOK_TARGET=UNKNOWN from the repo (dashboard-only config;
  presumably the production domain at go-live — Owner must set/verify).
PREVIEW_PAYMENT_WEBHOOK_CAN_HIT_PRODUCTION=YES (must be assumed: the webhook
  target is one fixed URL chosen in the dashboard, so whichever deployment it
  points at receives events for payments created by ANY deployment; today it
  points at the Preview URL, at go-live at Production — both directions exist).
WHY_MARKER_STICKINESS_IS_MANDATORY=the callback URL IS per-payment
  (getPaystackCallbackUrl() derives from the creating deployment's origin),
  but the webhook is NOT — so the same payment can legitimately finalize via
  callback on deployment X and webhook on deployment Y. Routing MUST therefore
  come from payment_transactions.metadata, never from the executing
  deployment's env flag. This is exactly the v4 marker design (§9a).
```

1. Read-only: confirm no live object named `coupon_reservations`,
   `reserve_coupon_use_v1`, `release_coupon_reservation_v1`,
   `complete_verified_payment_v2`, `heal_coupon_reservation_v1`.
2. Capture the **currently applied** `complete_verified_payment_v1` body
   (`SELECT prosrc FROM pg_proc WHERE proname='complete_verified_payment_v1';`)
   — v3's v2 body was prepared from the doc copy of v1; the preflight MUST
   diff the live body against the doc copy and reconcile any drift into v2
   before apply (v1 itself is never modified).
3. Owner logical export (pg_dump schema + coupon/reservation-relevant data).
4. Apply STEP A → smoke-test `reserve_coupon_use_v1` with service role →
   apply STEP B v3 → verify v1 body unchanged (same prosrc capture must match
   pre-apply) → verify grants/RLS.
5. Ship flag-gated app code (env flag, Preview=true) → run §12 matrix on
   Preview → flip Production env to true.
6. Post-apply verification query: `SELECT proname FROM pg_proc WHERE proname
   IN ('complete_verified_payment_v1','complete_verified_payment_v2');` — both
   present; v1 `prosrc` identical to the pre-apply capture.

## 12. Test plan (post-approval implementation)

The skipped race test in `tests/coupon-lifecycle.test.ts` is REMOVED and
replaced by an active concurrency suite. Required invariant case:

> two different `checkout_attempt_id` values + one remaining use + concurrent
> `reserve_coupon_use_v1` calls ⇒ **exactly one reservation succeeds**
> (`UNRELATED_COUPONS_BLOCKED` case included: concurrent reserves on two
> different coupon codes must both succeed).

| # | Case | Expected |
|---|------|----------|
| 1 | single available use, one checkout | reserved=true |
| 2 | same checkout replay | same reservation, no extra capacity |
| 3 | concurrent different checkouts, one use | exactly one reserved=true |
| 4 | different coupons concurrently | both succeed (no cross-coupon blocking) |
| 5 | expired reservation | frees capacity (predicate), no job needed |
| 6 | decline (authoritative) | released |
| 7 | cancel (authoritative) | released |
| 8 | failed (authoritative) | released |
| 9 | unknown provider state | NOT released before TTL |
| 10 | success (v2) | converted exactly once, uses+1 exactly once |
| 11 | callback replay (v2) | idempotent already_complete + heal no-op, no second consumption |
| 12 | webhook+callback v2 race | exactly once (shared selector + existing CAS) |
| 13 | late provider success after expiry | payment honored + over-redemption audit |
| 14 | unlimited coupon | no reservation row, no contention |
| 15 | disabled coupon after reserve | reservation stands (quote immutable); new checkouts rejected |
| 16 | deleted coupon after reserve | FK RESTRICT blocks deletion (safe fail) |
| 17 | **V1_PRODUCTION_PATH_UNCHANGED** | flag OFF ⇒ only v1 called; v1 body byte-identical |
| 18 | **V2_PREVIEW_RESERVATION_PATH** | flag ON ⇒ reserve + v2 end-to-end |
| 19 | **v1 ∥ v2 concurrent, same order** | one completion, one inventory, one coupon increment, one paid order; reservation converted |
| 20 | **v1 wins → v2 replay** | already_complete + reservation healed (converted) |
| 21 | **v2 wins → v1 replay** | v1 returns already_complete, zero deltas |
| 22 | **feature false ⇒ only v1** / **true ⇒ only v2** / **missing ⇒ v1** | creation flag behaves per §9a |
| 23 | **marker=2 payment finalizes as v2 even after flag flips false** | PAYMENT_PROTOCOL_STICKY |
| 24 | **v2 payment's webhook on flag=false deployment** | still v2 (DB marker) |
| 25 | **old v1 payment replays under flag=true** | still v1 (marker=1) |
| 26 | **no-marker payment** | safely v1 |
| 27 | **browser supplies version** | ignored; DB marker wins |
| 28 | **reserve RPC error/timeout/unavailable (flag ON, limited coupon)** | FAIL CLOSED: no Paystack init, cart+draft retained, truthful retry message |
| 29 | **same-coupon retry after release** | resurrection: same row reactivated, capacity re-checked, fresh TTL |
| 30 | **coupon change after release** | new attempt id (app) → new reservation; old row stays history |
| 31 | **two coupons reserved concurrently on one attempt** | partial unique index: exactly one wins |

## 13. Business timezone (unchanged)

`TIMEZONE_CONFIGURATION_RECOMMENDATION=` keep `BUSINESS_UTC_OFFSET="+01:00"`
(Lagos: no DST → exactly equivalent; stored instants absolute). Revisit only on
a move to a DST timezone.

---

## Required-output summary

```
CURRENT_HEAD=ab03515
V1_CHANGED=NO
V2_FUNCTION_SIGNATURE=complete_verified_payment_v2(p_transaction_id uuid, p_reference text, p_amount_kobo bigint, p_currency text, p_verified_at timestamptz) RETURNS jsonb (same shape as v1)
V2_SECURITY_MODE=SECURITY INVOKER, fixed search_path = pg_catalog, public
V2_GRANTS=REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role (same as v1)
V2_COUPON_CONVERSION_ATOMIC=YES
V1_WINS_V2_HEAL_BEHAVIOR=v2 replay returns already_complete and heals the still-reserved reservation to converted (evidence-checked, zero financial deltas)
V2_WINS_V1_REPLAY_BEHAVIOR=v1 replay returns already_complete with zero deltas (v1 untouched; probe is shared)
ORDER_ID_BIND_TIME=conversion (inside the v2 transaction; no invariant gain from earlier binding — checkout_attempt_id already implies the order↔reservation link)
REFERENCE_BIND_TIME=conversion (same transaction; reference is minted after reserve)
WHY=both bindings land in the same transaction that proves the payment
FINALIZER_SELECTOR_LOCATION=src/lib/payment-finalizer-selector.server.ts (planned; server-only)
CALLBACK_AND_WEBHOOK_SHARE_SELECTOR=YES (both funnel through finalizePayment; RPC name resolved ONLY from the stored marker)
BROWSER_CAN_SELECT_RPC=NO
FLOW_VERSION_STORAGE=payment_transactions.metadata.financial_finalization_version (existing jsonb metadata; SCHEMA_CHANGE_FOR_FLOW_VERSION=NO)
FLOW_VERSION_WRITTEN_WHEN=attempt creation, after successful reservation, BEFORE Paystack redirect
FLOW_VERSION_WRITTEN_BY=server checkout serverFn; immutable afterwards
BROWSER_CAN_CONTROL_FLOW_VERSION=NO
PAYMENT_PROTOCOL_STICKY=YES (FLAG_CHANGE_DURING_PAYMENT_SAFE=YES)
NEW_CHECKOUT_SELECTOR=flag gates marker+reservation at creation (false→v1 marker absent; true→reserve fail-closed + marker=2)
EXISTING_PAYMENT_SELECTOR=marker===2→v2; marker absent/1/other→v1
RESERVATION_ERROR_FALLBACK_TO_V1=NO
FAIL_CLOSED_BEFORE_PAYSTACK_INIT=YES
FINAL_RESERVATION_UNIQUE_CONSTRAINT=UNIQUE(coupon_id, checkout_attempt_id) + partial UNIQUE(checkout_attempt_id) WHERE state='reserved'
ONE_ACTIVE_COUPON_PER_CHECKOUT=TRUE
ONE_COUPON_EVER_PER_CHECKOUT_ATTEMPT=FALSE
CHECKOUT_ATTEMPT_REUSED_AFTER_COUPON_CHANGE=NO (app mints a new attempt id — verified checkout.server.ts:341)
COUPON_CHANGE_AFTER_RELEASE_SUPPORTED=YES
CURRENT_UNIQUE_CONSTRAINT_SAFE=YES (after v4 two-constraint correction)
STEP_A_FILENAME=supabase/migrations/20260914120000_coupon_reservations.sql
STEP_B_FILENAME=supabase/migrations/20260914120100_payment_finalization_v2.sql
ROLLBACK_PRESERVES_V1=YES
PREVIEW_FLAG=COUPON_RESERVATIONS_V1_ENABLED=true
PRODUCTION_FLAG=COUPON_RESERVATIONS_V1_ENABLED=false → true after Preview acceptance
FEATURE_MISSING_DEFAULT=V1
PROPOSED_SQL_UPDATED=YES
MIGRATION_APPLIED=NO
SHARED_DB_MUTATED=NO
PRODUCTION_DEPLOYED=NO
OWNER_APPROVAL_REQUIRED=YES
NEXT_SAFE_STEP=Owner authorizes apply-time run (procedure §11): preflight + v1 prosrc capture → export checkpoint → apply STEP A → verify → apply STEP B → verify v1 unchanged + v2/helper → reservation smoke test → implement selector/marker wiring + active race suite → Preview matrix.
```
