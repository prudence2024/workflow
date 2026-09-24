-- Read-only: capture live v1 identity for byte-identical verification.
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  p.prosecdef AS security_definer,
  p.proconfig AS config,
  encode(digest(pg_get_functiondef(p.oid), 'sha256'), 'hex') AS body_sha256
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'complete_verified_payment_v1';

-- Companion RPCs that must exist after STEP A (0 rows now, 2 rows after).
SELECT proname, pg_get_function_identity_arguments(p.oid) AS identity_args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('reserve_coupon_use_v1','release_coupon_reservation_v1');
