-- Checkout hardening: duplicate prevention, retry support, abandoned lifecycle
-- Safe migration: additive only, no destructive changes
--
-- REVISED: Based on live-schema preflight (2026-08-27):
--   - Live orders CHECK: pending|paid|processing|shipped|delivered|cancelled|refunded
--   - No checkout_attempt_id column exists
--   - No checkout indexes exist
--   - receipts.order_id has no UNIQUE constraint
--   - 1 pending order, 0 receipts (no duplicates to worry about)
--
-- OWNER INVARIANT:
--   ONE checkout_attempt_id → ONE logical order → ZERO OR MORE payment_transactions
--   Payment retries reuse the same order; new Paystack refs go into payment_transactions.
--   Therefore: UNIQUE(checkout_attempt_id) — NOT partial.

-- 1. Add checkout_attempt_id to orders (stable identity for same checkout attempt)
--    Nullable: existing orders have no checkout attempt (they predate this feature).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS checkout_attempt_id uuid;

-- 2. UNIQUE constraint: one logical order per checkout_attempt_id
--    NOT partial. A retry must NOT create another order with the same attempt ID.
--    Retries update the existing order and create new payment_transactions.
CREATE UNIQUE INDEX IF NOT EXISTS orders_checkout_attempt_unique
  ON public.orders (checkout_attempt_id)
  WHERE checkout_attempt_id IS NOT NULL;

-- 3. Add 'abandoned' to order status CHECK constraint
--    Safe: live query shows only 1 pending order, no rows will violate the new constraint.
--    We add 'abandoned' without removing any existing allowed values.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending','paid','processing','shipped','delivered',
    'cancelled','refunded','abandoned'
  ));

-- 4. Index for abandoned order lifecycle queries (pending orders older than threshold)
--    Replaces orders_status_created_idx (which uses DESC) with a more targeted
--    partial index that only covers pending orders — the only status the lifecycle cron touches.
CREATE INDEX IF NOT EXISTS orders_pending_lifecycle_idx
  ON public.orders (created_at)
  WHERE status = 'pending';

-- 5. Index for checkout attempt lookup (retry flow)
CREATE INDEX IF NOT EXISTS orders_checkout_attempt_idx
  ON public.orders (checkout_attempt_id)
  WHERE checkout_attempt_id IS NOT NULL;

-- 6. Unique constraint on receipts.order_id (prevent duplicate receipts per order)
--    Preflight confirmed: zero duplicate order_ids in receipts table.
--    This is safe to add.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'receipts_order_id_unique'
  ) THEN
    ALTER TABLE public.receipts ADD CONSTRAINT receipts_order_id_unique UNIQUE (order_id);
  END IF;
END $$;
