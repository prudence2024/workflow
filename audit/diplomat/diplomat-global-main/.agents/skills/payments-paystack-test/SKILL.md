---
name: payments-paystack-test
description: Paystack test-mode E2E verification. Test payment flow, webhook, signature, idempotency, coupon, inventory, receipt. Use only pk_test_/sk_test_ credentials.
version: 1.0.0
source: Diplomat Global Payment Architecture
---

# Payments — Paystack Test Mode

## Environment

- PAYSTACK_SECRET_KEY (sk_test_*) — server-only, API + webhook HMAC-SHA512
- PAYSTACK_PUBLIC_KEY (pk_test_*) — for reference only (hosted checkout)
- No separate webhook secret — Paystack uses PAYSTACK_SECRET_KEY for HMAC-SHA512

## Routes

- Callback: /checkout/callback (browser redirect after payment)
- Webhook: POST /api/webhook/paystack (server event)

## Test URLs

- Callback: https://<host>/checkout/callback
- Webhook: https://<host>/api/webhook/paystack

## Test Matrix

### Happy Path
1. Add product to cart
2. Apply valid coupon
3. Complete checkout form
4. Redirect to Paystack hosted page
5. Use test card: 4187427415564246, expiry: any future, CVV: any
6. Complete payment
7. Redirect to /checkout/callback
8. Verify: order status = paid, receipt generated, inventory decremented, coupon usage incremented

### Failure Paths
- Declined card
- Insufficient funds (test simulation)
- Abandoned payment (close browser after redirect)
- Network loss after payment
- Duplicate webhook (send same event twice)
- Invalid webhook signature
- Manipulated browser total (server rejects)
- Coupon applied but expired before payment

### Idempotency
- Duplicate callback → same order state
- Duplicate webhook → same order state
- CAS prevents double-processing

### Amount Verification
- Paystack amount (kobo) must match server order total × 100
- Mismatch → reject

## Evidence
- DB query: orders.status, orders.total, order_items, inventory, coupons.uses
- Server log: payment-finalize messages
- Browser: redirect chain, callback result
