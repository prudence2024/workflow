# Owner test-payment follow-up — forensic evidence (2026-09-12)

Scope: P0 payment UX defects reported after the Owner's authorized Paystack TEST
payment. No new charge was created; all database access was GET-only. Replay of
the already-paid reference was performed once via the approved RPC with the same
reference (sanctioned), plus a second idempotency call proving zero deltas.

## Timeline (all times UTC, 2026-09-12)

- 02:01:14 — payment_transactions POST (order d3ff24f9… attempt, later USSD-failed)
- 02:01:15 — transaction PATCH → pending; 02:01:12/02:02:17 — checkout re-reads
- 02:02:18 — transaction POST 31c1ed9f… (order bf58dbff…) + PATCH → pending
- 02:02:59 — **Paystack: charge.success (card) for DG-MTXQPF75-E0C6898B**
- 02:03:40 — orders GET for bf58dbff (getPaymentSuccessDetails serverFn reached DB)
- 02:03–02:08 — only admin-dashboard reads (payment_transactions list, order
  detail with receipts join, refunded aggregates)
- 02:06:42 — transaction POST 7e7b8a1d… (order 8870469/88740469…) + PATCH
- 02:06:48 — **Paystack: charge.success (card) for DG-MTXQV3D3-6C470060**
- 02:07:58 — transaction POST ab8cb875… (USSD attempt)
- 02:07:58 — orders GET for e71b4ca9 checkout_attempt_id
- 02:13:10–02:13:30 — six rapid admin transactions-list reads (Owner checking status)

## Provider truth (read-only GET transaction/verify)

| Reference | Provider status | Channel | Paid at |
|---|---|---|---|
| DG-MTXQPF75-E0C6898B | success | card | 02:02:59Z |
| DG-MTXQV3D3-6C470060 | success | card | 02:06:48Z |
| DG-MTXQWPY8-E22D7CD7 | failed | ussd | — (provider-confirmed attempt rejection) |

One additional attempt was abandoned (provider: abandoned).

## Application-side financial state at Owner session time

- payment_financial_completions rows: 0 · receipts: 0 · admin_notifications: 0
- All 4 transaction rows pending; both orders not paid; inventory 10 (no decrement)
- Supabase edge logs: ZERO requests matching finalizePayment's own queries
  (`payment_transactions?...reference=eq.`); zero `/rest/v1/rpc/*` calls;
  zero receipts/admin_notifications writes.
- At 02:03:40 a getPaymentSuccessDetails-shaped query DID execute → serverFn
  transport worked from that browser session.

Conclusion: the deployed application path never invoked finalizePayment after
the payments — the failure happened at the browser→serverFn boundary upstream
of any finalizer code path, and every client-side failure branch swallowed the
error with zero telemetry. Provider, RPC (sanctioned replay), and finalizer
logic are each individually proven correct; the gap was the unreachable call.

## Sanctioned replay (2026-09-12 10:32Z, same reference, no new charge)

- Call 1: already_complete=false → ledger +1, tx → successful, order → paid,
  inventory 10 → 9 (exactly once)
- Call 2: already_complete=true → +0 ledger, +0 inventory, +0 coupon

## Classification of the two provider successes

- DG-MTXQV3D3-6C470060 → order 88740469… — FINALIZED (paid, ledger 1, inv 9)
- DG-MTXQPF75-E0C6898B → order bf58dbff… (distinct order, status abandoned)
  — provider paid but application-finalized NO. This is NOT a duplicate success
  for the same order: it is an UNFINALIZED PAID ORDER requiring an Owner
  decision (finalize via application replay, or refund at Paystack TEST level).
  No automatic action was taken; no mutation performed.

## Duplicate-payment policy proposal (Production)

1. On finalization, if another provider-success transaction exists for a
   DIFFERENT order with the same amount+currency within a short window and the
   current order is already paid, flag for admin reconciliation
   (notification + dashboard badge). Never auto-refund.
2. Offer the customer an explicit "duplicate payment detected" state with
   support contact.
3. Owner decision gate: refund via Paystack dashboard (TEST) / refund API
   (Production) after human review.
4. Keep receipts canonical: one receipt per paid order; the duplicate
   attempt record must not create receipt-like documents.

## Defects fixed in this batch (code)

1. Cart clearing now goes through the canonical store action (`useStore().clearCart()`)
   in both success paths; raw `localStorage.removeItem("dg-cart")` removed —
   it bypassed React state and allowed the provider effect to resurrect items.
2. Checkout draft persistence (sessionStorage, strict allowlist, length caps,
   sensitive fields structurally excluded) — restored on refresh, retained on
   failure/decline, cleared on authoritative paid.
3. Provider-declined taxonomy: `failure_kind` = declined (provider-confirmed
   rejections only) vs failed; transaction rows record `status=failed` +
   gateway_response (CHECK already allows); Admin badge renders "Declined"
   from provider evidence; success page shows truthful "Payment Declined" /
   "Payment could not be completed" instead of false "Order placed".
4. Forensic capture (Sentry, non-PII) on every non-success finalization path —
   the silent failure class can never repeat without a trace.

## Sentry triage (Section 22 items)

- DIPLOMAT-GLOBAL-Z (`t.flatMap is not a function`, env=preview, 2 events,
  2026-09-11 15:51Z): frame is store-provider cart flatMap. The hardened cart
  parser (e3a2f63, 2026-09-05) structurally guarantees arrays; the events are
  older than any bundle containing it — classified STALE_BUNDLE_ARTIFACT,
  structurally eliminated; zero events since.
- DIPLOMAT-GLOBAL-Y (h3 swallowed SSR 500, 2026-09-11 00:18Z): tags
  environment=local, url=127.0.0.1:4203 — captured by the app's own SSR
  recovery net during local artifact testing, NOT a deployed defect.
- rls_auto_enable remains queued for the dedicated security pass (unchanged).

## Gates re-run for this batch

TSC PASS · full suite 521/521 (28 files) · diff --check CLEAN · no secrets in
changed files · build lifecycle + serverFn integrity (516/0) + local runtime
smoke earned earlier this batch on identical source.
