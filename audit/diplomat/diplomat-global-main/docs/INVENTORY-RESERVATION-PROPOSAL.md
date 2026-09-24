# INVENTORY RESERVATION PROPOSAL — FINAL-UNIT PAYMENT RACE (OWNER DECISION REQUIRED)

**Status:** PROPOSAL ONLY — NOT IMPLEMENTED (Owner addendum §10 forbids this migration without approval).
**Evidence:** `scripts/final-unit-concurrency.live.ts` (live RPC concurrency run: 4 scenarios, 0 invariant failures).

## Proven current behavior (live, 2026-09-17)

Two customers open Paystack windows for the last unit. Both payments CAN succeed at
the provider (nothing reserves stock at checkout/Paystack-init). At finalization the
v2 RPC serializes per product and the loser's finalization rolls back entirely
(`Inventory requires reconciliation`): **no oversell, no paid order, no receipt for
the loser — but the loser's money WAS taken**, so their money must be manually
refunded today.

Answers to §7:

1. Can both Paystack transactions become provider-successful? **YES.**
2. B (loser): no order ever becomes paid; inventory decrement fails; financial
   finalization stays incomplete; **no automatic refund exists**; **manual refund
   required**; **no false receipt is sent**; cart-clear behavior is client-side and
   B's success screen shows an order-not-confirmed warning ("Please do not make
   another payment") — truthful, but money is held.
3. Current architecture does NOT prevent the second Paystack initialization.
4. Stock is NOT held/reserved before provider payment.
5. No inventory-reservation record/TTL exists for products (reserved column exists
   but is never written by checkout).
6. The atomic decrement happens only AFTER provider success (inside the RPC).
7. Guarantees: **NO OVERSELL = guaranteed (proven)**; **NO PAID-BUT-UNFULFILLABLE
   ORDER = NOT guaranteed** (the paid-but-unfulfillable state is avoided at DB level
   by refusing completion, at the cost of holding customer money).

## Proposed design

### Schema (additive, single migration)

```sql
CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  checkout_attempt_id uuid,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','converted','released','expired')),
  reference text,                        -- payment reference once known
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  converted_at timestamptz,
  released_at timestamptz
);
CREATE INDEX IF NOT EXISTS inventory_reservations_product_state_idx
  ON public.inventory_reservations (product_id, status) WHERE status = 'reserved';
CREATE INDEX IF NOT EXISTS inventory_reservations_expiry_idx
  ON public.inventory_reservations (expires_at) WHERE status = 'reserved';
-- Available quantity = inventory.quantity - active(reserved, unexpired) reservations:
CREATE OR REPLACE FUNCTION public.inventory_available_v1(p_product_id uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT i.quantity - COALESCE((
    SELECT SUM(r.quantity) FROM public.inventory_reservations r
    WHERE r.product_id = p_product_id AND r.status = 'reserved'
      AND r.expires_at > now()), 0)
  FROM public.inventory i WHERE i.product_id = p_product_id;
$$;
```

### Lifecycle

- **Reserve (atomic):** at Paystack init, inside the same transaction that creates
  the pending order: one conditional INSERT per product —
  `INSERT ... SELECT ... WHERE inventory_available_v1(product) >= qty` (unique
  partial facts; conflict → checkout fails closed with "item just sold out").
  `expires_at = now() + interval '30 minutes'` (Paystack window).
- **Convert (success):** v2 RPC already runs in one transaction — add: convert this
  checkout's reservations `reserved → converted` BEFORE the inventory decrement, and
  decrement `quantity - converted_reservations` (the converted reservation occupies
  the units). Replay/idempotency: conversion is idempotent (row lock + state check),
  and the existing completion ledger already fences double-finalize.
- **Release:** decline/failure path (authoritative provider verdict) releases
  `reserved → released` in the existing release step; cancel/abandon releases on
  user action; TTL expiry releases lazily (availability ignores expired rows) and a
  daily sweep marks rows `expired` for hygiene.
- **Admin stock adjustment:** reducing stock below active reservations is allowed;
  over-reserved state surfaces in Admin (available ≤ 0) and losers still fail closed
  at finalization exactly as today — Admin stays the safety valve.
- **Multiple quantities/products:** one row per (product, checkout) with its own
  quantity; availability is per product.
- **Abandoned Paystack sessions:** covered by TTL (no polling; lazy availability).
- **Idempotency:** reserve once per checkout_attempt_id (unique index); callback +
  webhook replays hit the completion ledger, never re-reserve.

### Concurrency model

Availability = physical stock − active reservations, computed under row locks:
reserve INSERTs guard on `inventory.quantity` via the STABLE function inside a
`SELECT ... FOR UPDATE` of the inventory row (single-writer per product); the v2 RPC
already locks inventory rows per sorted product_id. No deadlock: same lock order
(inventory → reservations) everywhere.

### Migration impact

Additive only: 1 table, 2 partial indexes, 1 STABLE function, 1 RPC-variant
(complete_verified_payment_v3 or v2 extension behind a flag column) + reserve/release
helper RPCs. No changes to v1. Rollback = drop new objects; pre-v3 code path keeps
working (v1 RPC unchanged, v2 untouched). Shared-DB discipline: preflight against
live schema, apply deliberately, verify with the existing post-migration scripts.

### What it buys

The loser of the race never gets charged: their checkout fails at Paystack-init
("item just sold out") instead of after paying. Removes the manual-refund workload.

### Cost / risks

Short-term stock invisibility during the 30-min window (visitor A's abandoned
window hides 1 unit from B); one more table in the payment path; migration + RPC
review burden. Both mitigated by TTL choice and the existing audit/ledger pattern.

**Decision requested:** approve this migration (or keep current fail-closed behavior
with manual refunds as the accepted business trade-off).
