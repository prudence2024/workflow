-- Post-STEP-B verification (read-only, single statement): v1 byte-identity,
-- v2 + helper existence/security, grants.
SELECT jsonb_build_object(
  'v1', (SELECT jsonb_build_object(
           'exists', count(*) = 1,
           'security_definer', bool_or(p.prosecdef),
           'config', min(p.proconfig::text),
           'body_sha256', encode(digest(min(pg_get_functiondef(p.oid)), 'sha256'), 'hex'))
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='complete_verified_payment_v1'),
  'v2', (SELECT jsonb_build_object(
           'exists', count(*) = 1,
           'args', min(pg_get_function_identity_arguments(p.oid)),
           'security_definer', bool_or(p.prosecdef),
           'config', min(p.proconfig::text))
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='complete_verified_payment_v2'),
  'heal', (SELECT jsonb_build_object(
           'exists', count(*) = 1,
           'args', min(pg_get_function_identity_arguments(p.oid)),
           'security_definer', bool_or(p.prosecdef),
           'config', min(p.proconfig::text))
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='heal_coupon_reservation_v1'),
  'v2_execute_grants', (SELECT jsonb_agg(jsonb_build_object('grantee', grantee, 'priv', privilege_type))
         FROM information_schema.role_routine_grants
         WHERE specific_schema='public' AND routine_name IN
           ('complete_verified_payment_v2','heal_coupon_reservation_v1'))
) AS step_b_report;
