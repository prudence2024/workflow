-- STEP A post-apply verification (read-only, single statement).
SELECT jsonb_build_object(
  'columns', (SELECT jsonb_agg(jsonb_build_object('col', column_name, 'type', data_type, 'null', is_nullable) ORDER BY ordinal_position)
              FROM information_schema.columns
              WHERE table_schema='public' AND table_name='coupon_reservations'),
  'constraints', (SELECT jsonb_agg(jsonb_build_object('name', conname, 'def', pg_get_constraintdef(oid)) ORDER BY conname)
              FROM pg_constraint WHERE conrelid='public.coupon_reservations'::regclass),
  'indexes', (SELECT jsonb_agg(jsonb_build_object('name', indexname, 'def', indexdef) ORDER BY indexname)
              FROM pg_indexes WHERE schemaname='public' AND tablename='coupon_reservations'),
  'rls', (SELECT jsonb_build_object('enable', relrowsecurity, 'force', relforcerowsecurity)
              FROM pg_class WHERE oid='public.coupon_reservations'::regclass),
  'table_grants', (SELECT jsonb_agg(jsonb_build_object('grantee', grantee, 'privs', privileges))
              FROM (SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
                    FROM information_schema.role_table_grants
                    WHERE table_schema='public' AND table_name='coupon_reservations'
                    GROUP BY grantee) t),
  'rpcs', (SELECT jsonb_agg(jsonb_build_object('name', proname, 'args', pg_get_function_identity_arguments(p.oid),
                       'security_definer', prosecdef, 'config', proconfig) ORDER BY proname)
              FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public'
                AND p.proname IN ('reserve_coupon_use_v1','release_coupon_reservation_v1')),
  'rpc_execute_grants', (SELECT jsonb_agg(jsonb_build_object('routine', routine_name, 'grantee', grantee, 'priv', privilege_type) ORDER BY routine_name, grantee)
              FROM information_schema.role_routine_grants
              WHERE specific_schema='public'
                AND routine_name IN ('reserve_coupon_use_v1','release_coupon_reservation_v1'))
) AS step_a_report;
