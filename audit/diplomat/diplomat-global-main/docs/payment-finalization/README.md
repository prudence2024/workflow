# Payment financial completion proposal — OWNER APPROVAL REQUIRED

Status: proposed, not deployed, no application call site enabled. Independent of Migration A (cost/analytics) and B (performance). Historical reference `DG-MTLML9QG-WWA7` remains frozen. Approved phone, delivery and TEST credentials are not blockers. Product Detail and checkout retain Owner PASS.

## Current state machine

The server verifies Paystack and the reference/order/immutable quote before updating the payment. The order paid CAS elects a single request to execute inventory, coupon and notifications. Losing requests skip these effects even if the winner crashed. A receipt can be retried, but receipt existence is not proof that stock/coupon effects ran.

| Stage, in actual execution order | Idempotent on retry | Durable completion marker | Atomic with previous | Crash recoverable | External effect |
|---|---|---|---|---|---|
| 1 Provider verified | Safe repeated GET | No persisted verification result | No | Verification can repeat | Paystack GET |
| 2 Payment successful | Rewrites status/timestamp | Transaction status; not financial completion | No | Can retry this write | No |
| 3 Order paid | CAS elects winner | Order status/reference only | No | Lost effects cannot be inferred | No |
| 4 Inventory consumed | Normal retry skips; exact-value CAS handles contention | No per-order stock marker | No | **No** | No |
| 5 Coupon consumed | Normal retry skips; bounded exact-value CAS | No per-order coupon marker | No | **No** | No |
| 6 Receipt created | Unique order receipt + lookup/retry | Receipt row/token | No | Generation can retry; delivery not guaranteed | No |
| 7 Admin payment notification | Event-key upsert intended | Notification row, no durable pending job | No | Failed/skipped delivery not resumed | No |
| 8 Telegram notification | CAS winner only | No delivery/idempotency marker | No | No | Telegram HTTP |
| 9 Admin email | CAS winner only | No per-payment delivery marker | No | No | Resend HTTP |
| 10 Customer email | CAS winner only | No per-payment delivery marker | No | No | Resend HTTP |

Receipt email helpers have sent timestamps, but the finalizer's generic transactional email calls do not persist a unique send event/provider receipt. Notification upsert targets `event_key`; repository migration defines a partial active-row unique index, so exact deployed conflict-index compatibility must be checked. Neither existence of a row nor a best-effort catch is a durable outbox.

Effect classification (end-to-end delivery): receipt `DURABLE_IDEMPOTENT` for row creation only; customer email, Admin email, Admin notification, Telegram `NORMAL_RETRY_ONLY`. All lack durable scheduled redelivery. This batch does not implement the wider provider/outbox programme. Financial completion must not depend on them.

## Deployed schema assessment

Read-only service-authorized PostgREST OpenAPI inspection on `urorrrmyzsuwulfljvwm.supabase.co` found:

- `orders`: status, payment_reference, checkout_attempt_id, but no financial completion marker.
- `payment_transactions`: status, metadata, paid_at, but no atomic effect ledger.
- `inventory`: product_id, quantity, reserved; no per-order consumption marker.
- `coupons`: uses/max_uses; no order consumption marker.
- `receipts`: order_id, transaction_id, download_token and send timestamps.
- No exposed outbox/effect/finalization table; only exposed RPC `rls_auto_enable`.

This describes the exposed deployed API, not a full privileged pg_catalog inspection. Constraint definitions/private functions require the SQL preflight below before application. The current application uses separate REST writes and no hidden transactional mechanism. Existing JSON metadata cannot make an inventory update and its marker atomic. `CURRENT_SCHEMA_CAN_GUARANTEE_DURABLE_FINALIZATION=NO` for the current accessible application contract.

## Proposed financial boundary

`PROPOSED.sql` adds one completion table and one service-role-only RPC. It is deliberately outside `supabase/migrations` to prevent accidental batch application.

- `order_id` primary key: one financial completion per order, including multiple payment attempts.
- `transaction_id` and `reference` unique: bind the winner to one verified payment.
- `quote`: immutable evidence of precisely what was consumed; later edits cannot silently reinterpret completion.
- `provider_verified_at`: server attestation timestamp after provider GET; no provider keys/payload/customer information stored.
- `completed_at`: durable successful financial transaction marker.
- RLS and revoked anon/authenticated/public access: browser cannot authorize payment or invoke RPC.

Server verifies provider **success, exact reference, exact kobo amount and currency** outside PostgreSQL, then calls RPC with that verification. RPC validates reference, full immutable quote, order items/totals/currency and new protocol version. It locks order, payment, items, sorted inventory rows, then coupon. Inventory and coupon updates, payment successful, order paid, and completion insertion commit together. No external provider calls, receipt generation or notifications occur in the transaction.

Before COMMIT failure: PostgreSQL rolls back every financial effect. Retry performs them once. After COMMIT/response loss: retry sees the completion row and performs no update. Concurrent callback/webhook/success checks serialize at the order lock. Other attempts for that order fail closed rather than consuming again. Coupon absent means no coupon query/update.

Stock uses available quantity (`quantity - reserved`); consumed quantity may not become negative. Coupon increments respect max_uses and the immutable purchase entitlement; the discount is never recalculated after provider success. Shortage, missing product/coupon, exhausted usage, snapshot mismatch and conflicting references roll back and require reconciliation. The application must distinguish provider-paid/reconciliation-required from completed accounting, alert safely, and tell the customer **do not pay again**. Automatic eventual completion cannot be promised for permanently insufficient inventory or irrecoverable deleted data. Reservation policy is not silently introduced here.

## Backward compatibility and rollout

1. Take a verified backup and run `preflight.sql`; review exact constraints, permissions, triggers and ambiguous historical paid rows.
2. Owner separately approves **this focused payment migration**, not Migration A/B. Apply only this file.
3. Deploy tested application integration: new attempts use `metadata.financial_finalization_version = 1`; finalizer verifies provider then invokes the RPC instead of the old payment/order/CAS/inventory/coupon writes. Do not retain an old write fallback for version 1.
4. Pause creation/finalization during cutover and drain old deployments/in-flight requests. Merely adding a function does not prevent old code racing it.
5. Fresh version-1 attempts alone enter the RPC. Existing paid orders without a completion row are **ambiguous**, never auto-marked complete and never auto-consumed. Existing pending attempts must be handled under a separate reviewed cutover/reconciliation plan. No backfill is in this proposal.
6. Read-only success lookup must use the completion marker for version-1 accounting readiness after integration. Receipt retry remains a read-only operation. Downstream effects execute only after commit, and future durable delivery needs outbox work.
7. Run the full integration/failure-injection gates and resolve the exact Ready Preview before asking for one Owner TEST payment.

Historical paid-but-incomplete state cannot be uniquely reconstructed from aggregate stock and uses. For new protocol transactions that state is impossible after commit: either everything rolls back or all financial effects and marker persist. Case C must reject ambiguous legacy states, not invent prior completion. The frozen historical reference is explicitly rejected by this proposed RPC.

## Rollback

Before any version-1 use, revoke RPC execution and roll back the application protocol change; unused objects may be removed after review. After any completion, preserve the ledger and data. Disable new attempts, keep read-only paid/receipt access, and roll forward or reconcile explicitly. Never revert to the old finalizer for version-1 orders or reverse stock/coupon updates by dropping a table. No destructive down migration is supplied.

## Failure-injection acceptance matrix

| Case | Required proof |
|---|---|
| A Fail before inventory | Entire SQL transaction rolls back; retry consumes once |
| B Fail after inventory/before coupon | Stock rollback; retry consumes stock and coupon once |
| C Paid but unmarked | Legacy rejected untouched; simulated version-1 interrupted transaction leaves no partial paid state |
| D Callback + webhook concurrent | One completion, one stock/coupon effect |
| E Success check concurrent | Read-only query has no effects; repeated RPC converges |
| F Receipt fails after commit | Completion/order/payment/stock/coupon remain committed |
| G Email fails after commit | Same financial state; no second payment |
| H Telegram fails after commit | Same financial state; no second payment |
| I Repeat complete RPC | `already_complete=true`; no further financial update |

Local proof must run this exact SQL against disposable PostgreSQL with fixture tables. Trigger-based failures belong only to test fixtures, never production RPC parameters. Separate connection concurrency is required. This is proposed-RPC evidence, not live Supabase or integrated application proof.

## Remaining programme

This payment batch does not close the project. The Owner's full 51-item programme remains open across public UX, frontend/Admin, CMS/products/content, dashboard/customers, providers/email/Telegram, Admin operations/security, Owner-gated infrastructure, and final skill execution/Security-300/Lighthouse/WCAG/full-system-audit. Full-system-audit stays last. Existing defect/work registers remain authoritative alongside the latest Owner backlog; none of those items is implicitly deferred or completed by this proposal.
