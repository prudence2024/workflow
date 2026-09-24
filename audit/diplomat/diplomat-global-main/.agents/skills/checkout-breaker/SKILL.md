---
name: checkout-breaker
description: Test checkout flow integrity. Price authority, cart manipulation, delivery, coupons, inventory, order creation, payment initialization.
version: 1.0.0
---

# Checkout Breaker

## Price Authority
- Product prices come from DB (products.price)
- Client sends unitPrice → server validates against DB
- Server recalculates subtotal, discount, delivery, total
- Paystack receives server-calculated amount

## Delivery Fee
- Current: hardcoded ₦7,500 (client + server)
- Free delivery: subtotal >= ₦250,000
- No DB/site_settings source exists
- OWNER DECISION REQUIRED for authoritative value

## Coupon Flow
- Client sends couponCode only
- Server validates: exists, active, dates, usage limit
- Server calculates discount (percentage or fixed)
- Discount cannot exceed subtotal
- Total cannot go negative
- Cart changes invalidate coupon
- Coupon revalidated at payment initialization
- Usage incremented only after successful payment

## Test Matrix
- Empty cart → disabled checkout
- Add/remove items → totals recalculate
- Quantity change → totals update
- Coupon apply/remove/replace
- Coupon + cart change → invalidation
- Direct API manipulation → server rejects
- Duplicate rapid submit → idempotent
- Network loss mid-checkout → recoverable

## Evidence
- DB: orders table state
- Server: checkout.server.ts logs
- Browser: checkout form behavior
