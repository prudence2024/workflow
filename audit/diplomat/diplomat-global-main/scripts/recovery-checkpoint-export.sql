-- ============================================================================
-- RECOVERY CHECKPOINT (data) — 2026-09-14, read-only exports for the coupon-
-- reservation apply. Restore procedure: if STEP A/B must be reversed, run
-- docs/coupon-reservations/ROLLBACK.sql (drops v2+helper first, then STEP A
-- objects; v1 never touched). Financial rows below are the authoritative
-- before-state; after apply, a fresh export is diffed against this one.
-- ============================================================================
SELECT 'orders' AS table_name, count(*) AS row_count FROM public.orders
UNION ALL SELECT 'payment_transactions', count(*) FROM public.payment_transactions
UNION ALL SELECT 'payment_financial_completions', count(*) FROM public.payment_financial_completions
UNION ALL SELECT 'coupons', count(*) FROM public.coupons;
