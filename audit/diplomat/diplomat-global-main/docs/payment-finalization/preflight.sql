-- READ ONLY. Run against the approved database before any DDL; review output privately.
SELECT current_database(), current_user;
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns WHERE table_schema = 'public'
AND table_name IN ('orders','order_items','payment_transactions','inventory','coupons','receipts','payment_financial_completions')
ORDER BY table_name, ordinal_position;
SELECT conrelid::regclass AS relation, conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE connamespace = 'public'::regnamespace
AND conrelid IN ('public.orders'::regclass,'public.order_items'::regclass,'public.payment_transactions'::regclass,
 'public.inventory'::regclass,'public.coupons'::regclass,'public.receipts'::regclass);
SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public'
AND tablename IN ('orders','payment_transactions','receipts','admin_notifications');
SELECT p.oid::regprocedure, p.prosecdef, p.proacl FROM pg_proc p
WHERE p.pronamespace='public'::regnamespace;
SELECT tgrelid::regclass, tgname, pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgrelid IN ('public.orders'::regclass,'public.payment_transactions'::regclass,
 'public.inventory'::regclass,'public.coupons'::regclass);
-- Aggregate counts only; no historical replay or customer data export.
SELECT status, count(*) FROM public.orders GROUP BY status;
SELECT status, count(*) FROM public.payment_transactions GROUP BY status;
SELECT count(*) AS invalid_inventory FROM public.inventory WHERE quantity < 0 OR reserved < 0 OR reserved > quantity;
SELECT count(*) AS invalid_coupon_usage FROM public.coupons WHERE uses < 0 OR (max_uses IS NOT NULL AND uses > max_uses);
SELECT count(*) AS missing_product_items FROM public.order_items WHERE product_id IS NULL;
