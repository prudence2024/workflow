-- ============================================================
-- Supabase grant hardening — Owner-approved (security audit §6)
-- Date: 2026-09-16 · Findings: 2× MEDIUM grant hygiene
--
-- 1. admin_notifications + privacy_requests were created AFTER the baseline
--    `REVOKE ALL ON ALL TABLES FROM anon, authenticated` sweep, and Supabase
--    platform defaults left anon/authenticated with TRUNCATE+REFERENCES
--    (verified live via has_table_privilege before this migration).
-- 2. rls_auto_enable() is SECURITY DEFINER with default PUBLIC EXECUTE.
--    No exploit path exists today (anon lacks CREATE on schema public), but
--    least privilege requires removing PUBLIC/anon/authenticated EXECUTE.
--
-- Required server/service access is PRESERVED explicitly:
--   service_role keeps ALL on both tables and EXECUTE on rls_auto_enable.
--
-- Idempotent: safe to re-run. Rollback: re-GRANT the same privileges.
-- ============================================================

-- A. Residual browser-role table privileges (RLS does not govern TRUNCATE).
REVOKE ALL ON public.admin_notifications FROM anon, authenticated;
REVOKE ALL ON public.privacy_requests FROM anon, authenticated;

-- B. Explicit server-role grants so required access survives the revokes
--    (admin_notifications already had ALL from its own migration; privacy_requests relied on platform defaults).
GRANT ALL ON public.admin_notifications TO service_role;
GRANT ALL ON public.privacy_requests TO service_role;

-- C. Default-privilege drift closure: future tables must not re-acquire browser-role privileges.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

-- D. SECURITY DEFINER event-trigger helper must not be PUBLIC-executable.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;

-- ============================================================
-- VERIFICATION (post-apply, expect all browser roles false / service true)
-- select has_table_privilege('anon','public.admin_notifications','TRUNCATE')       -- false
-- select has_table_privilege('authenticated','public.privacy_requests','TRUNCATE') -- false
-- select has_function_privilege('public','rls_auto_enable()','EXECUTE')            -- false
-- select has_function_privilege('service_role','rls_auto_enable()','EXECUTE')      -- true
-- ============================================================
