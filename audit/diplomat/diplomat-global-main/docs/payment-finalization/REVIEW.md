# Independent payment-finalization migration review — DO NOT APPLY YET

Reviewer: separate agent from the proposal author. Date: 2026-09-08. Worktree `d2127ee`.
Scope: code reconstruction, read-only deployed-schema inspection, line-by-line `PROPOSED.sql`
review against review points A–K, and real-SQL failure-injection proof on a disposable
local PostgreSQL 17.6 cluster. Nothing was applied to the deployed Supabase instance.

## 1. Current finalization sequence (reconstructed from `payment-finalize.server.ts`)

1. Resolve `payment_transactions` by `reference` (fallback `paystack_reference`).
2. Load order + `order_items` + customer.
3. Paystack `verifyTransaction` GET (fail-closed messages; never claim success on error).
4. `validatePaymentBinding` (reference/amount/currency/quote semantics).
5. Write `payment_transactions.status='successful'` (idempotent rewrite, committed immediately).
6. If order already paid: require `payment_reference === reference`, retry idempotent receipt
   creation only — `shouldDecrementInventoryForFinalization` / `shouldConsumeCouponForFinalization`
   both return false when `orderWasAlreadyPaid` — **stock/coupon are skipped forever**.
7. CAS claim `orders.status pending/abandoned → paid` (single winner).
8. Winner only: per-item inventory CAS decrements (out-of-stock logged for reconciliation,
   payment stays valid), coupon `uses` CAS increment, receipt create-or-reuse, then
   best-effort notifications, Telegram, admin email, customer email, audit log.

**CRASH_GAP_CONFIRMED=YES.** A crash after step 7 (order paid) but before/during step 8
leaves `orders.status='paid'` with inventory/coupon unconsumed. Every later call takes the
step-6 branch, skips both effects by the `orderWasAlreadyPaid` gate, and still returns
`payment_confirmed`. This matches the reproduced probe (inventory 10 stays 10, no inventory
request). The code comment block itself states this remains a reconciliation case.

Downstream emails/Telegram/notifications are best-effort and never gate the paid result —
consistent with programme requirement K.

## 2. Deployed schema — read-only inspection (service-authorized PostgREST OpenAPI)

All 30 exposed tables enumerated; no outbox/ledger/completion table exists; the only exposed
RPC is `rls_auto_enable`. Relevant columns verified: `orders(id, reference UNIQUE, status,
payment_reference, subtotal, discount, delivery_fee, total, currency, coupon_id,
idempotency_key, checkout_attempt_id)`; `payment_transactions(id, order_id, reference UNIQUE,
paystack_reference, amount, currency, status, paid_at, metadata)`; `inventory(product_id,
quantity, reserved)`; `coupons(id, uses, max_uses, active, …)`; `order_items(id, order_id,
product_id, sku, name, quantity, unit_price, line_total)`; `receipts(…, download_token)`.
No per-order inventory/coupon consumption marker exists anywhere.

**CURRENT_SCHEMA_CAN_SOLVE_WITHOUT_MIGRATION=NO** — independently proven, agreeing with the
proposal's assessment. (Caveat, unchanged from the proposal: this inspects the exposed API,
not `pg_catalog`; `preflight.sql` covers constraints/triggers before application.)

## 3. PROPOSED.sql line-by-line findings (A–K)

- A. Atomicity — PASS. Single plpgsql function: all writes (inventory, coupon, transaction,
  order, completion insert) commit or roll back together with the caller's transaction.
- B. Idempotency — PASS (proven). `payment_financial_completions.order_id` PK is the
  idempotency key; repeat calls short-circuit `already_complete=true` with zero mutation.
- C. Concurrency — PASS (proven). Lock order: `orders FOR UPDATE` first, then transaction,
  then item rows, then sorted-product inventory updates, then coupon. Callback/webhook/
  success-recheck serialize on the order lock; winner inserts the completion row, losers see
  it and return `already_complete`. The only `FOR UPDATE` cycle would need two orders in
  opposite product order; the proposal sorts product locks, and the order lock serializes
  same-order callers.
- D. Inventory — PASS (proven). Aggregates per product; `available = quantity - reserved`;
  `UPDATE … WHERE quantity - coalesce(reserved,0) >= qty` makes negative stock impossible;
  sorted product order; any shortage raises and rolls back every item.
- E. Coupon — PASS (proven). No coupon → no coupon code path. Present → row-locked,
  `uses >= max_uses` rejected, `uses + 1` exactly once; the discount is never recalculated
  (the immutable quote entitlement is authoritative).
- F. Money authority — PASS. Inputs are transaction id, reference, provider-verified kobo
  amount, currency, timestamp. The RPC cross-checks amount×100, currency, totals,
  subtotal/discount/delivery identity, and full item snapshot against DB-stored data; browser
  values are unreachable by construction.
- G. Provider calls — PASS. No HTTP of any kind inside the transaction.
- H. Frozen reference — PASS (proven). First statement rejects `DG-MTLML9QG-WWA7` outright.
- I. Security — PASS. `SECURITY INVOKER` + `SET search_path = pg_catalog, public`; RLS
  enabled on the ledger; ALL revoked from PUBLIC/anon/authenticated; the function performs
  its own INSERT while `GRANT SELECT, INSERT ON the ledger TO service_role` covers both the
  invocation (application server runs as service role) and the documented post-integration
  read-only success lookup. EXECUTE granted to `service_role` only, so the RPC is not
  browser-callable via PostgREST.
- J. Error behavior — PASS (proven). Binding mismatch, snapshot mismatch, shortage, coupon
  exhaustion, unknown transaction, conflicting completion, and legacy ambiguous states all
  raise before any mutation; the transaction rolls back cleanly.
- K. Backward compatibility — PASS. References only columns that exist today (`products`
  is never touched; no `cost_price` dependency). Quote JSON (`items[].product_id/sku/name/
  quantity/unit_price/line_total`, scalar totals, `coupon_id`) matches `CheckoutQuote`
  exactly; the `cost_price` strip via `value - 'cost_price'` is a no-op pre-Migration A and
  the expected snapshot stays JSON-identical to `order_items`.

### Corrections considered and rejected (no changes made to the proposal)

- **Coupon double-consume on failed repeat** — considered; rejected as impossible: the RPC
  locks the coupon row `FOR UPDATE` before reading `uses`, so read-after-lock is atomic
  within the RPC, and the completion short-circuit prevents any second consumption.
- **`GRANT SELECT, INSERT` breadth** — considered narrowing to `SELECT`; rejected: the
  SECURITY INVOKER function itself performs the ledger INSERT as `service_role`, so the
  INSERT grant is required for the RPC to work; the grant set is already least-privilege
  for the documented integration.

No modification to `PROPOSED.sql`, `preflight.sql`, or `postflight.sql` was necessary.

## 4–5. Preflight / postflight review

- `preflight.sql` — READ-ONLY confirmed (only `SELECT`s). Proves tables/columns, constraints,
  indexes, function inventory, trigger inventory (nothing that could fight the RPC), aggregate
  state counts (negative stock, over-used coupons, null-product items), and the frozen
  reference is never named as data. Naming collision check: `to_regprocedure` target absent.
- `postflight.sql` — READ-ONLY confirmed. Proves the RPC exists, that anon/authenticated
  lack EXECUTE while `service_role` has it, that completions agree with orders/transactions,
  and that the frozen reference never appears in the ledger.

## 6. Rollback review

Pre-first-use: revoke EXECUTE, revert application protocol flag, optionally drop the two
objects — removes only new objects; no business data exists yet. Post-completion: keep the
ledger; never reverse stock/coupons by dropping data; no destructive down migration exists.
Schema rollback is correctly separated from business reversal. PASS.

## 7. Failure-injection proof (disposable local PostgreSQL 17.6, real SQL)

Environment: throwaway `initdb` cluster under gitignored `.freebuff/`, loopback :5544,
trust auth, fixture schema mirroring deployed columns (no `cost_price` — Migration A
unapplied). Trigger-based crash injection for scenario 1 is a fixture, never an RPC parameter.

| # | Scenario | Result |
|---|---|---|
| 1 | Crash (trigger) at order-paid after inventory → rollback | PASS — stock restored, order pending, no completion row |
| 2 | Complete finalization → stock exactly once | PASS — 10→9, order paid, transaction successful |
| 3/9 | Repeat after complete → zero mutation | PASS — `already_complete=true`, stock 9, one completion row |
| 4/5 | Coupon consumed exactly once; repeat unchanged | PASS — uses 0→1, stays 1 |
| 6 | Multi-item atomic success | PASS — both products decremented once |
| 7 | One product short → all rollback | PASS — both items unchanged, order pending |
| 8 | Two concurrent connections finalize one order | PASS — winner `already_complete=false`, loser `already_complete=true`, stock 9, one completion row |
| 10 | Invalid bindings (kobo off-by-one, USD, wrong reference, unknown txn) | PASS — rejected, zero mutation |
| 10e | Legacy paid order without version marker | PASS — `Unmarked historical state requires reconciliation`, untouched |
| 10f | Frozen `DG-MTLML9QG-WWA7` | PASS — rejected by name, zero mutation |

Note: test-fixture corrections during the run (legacy row needed version marker + items to
reach the intended branch) were bugs in the test fixtures, not in the RPC; every rejection
that fired early still failed closed with zero mutation.

## Decision

**MIGRATION_RECOMMENDATION=APPROVE_AS_WRITTEN**

The design is sound, matches the deployed schema, respects every locked architecture rule,
and every one of the ten failure-injection scenarios passes against real PostgreSQL with
true concurrency. The application finalizer remains unchanged and
`PAYMENT_ATOMICITY_CRASH_GAP=OPEN` until the Owner approves application, postflight passes,
and the RPC is integrated and re-proven.
