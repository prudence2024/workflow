-- ============================================================
-- ADMIN NOTIFICATION READ STATE
-- Per-admin persistent read receipts for security audit events.
--
-- audit_logs = permanent security evidence (never mutated)
-- admin_notification_reads = whether a specific Admin has reviewed an event
--
-- This enables:
-- - Admin A reads a security alert → A sees it as read
-- - Admin B still sees it as unread
-- - Read state survives refresh, sign-out/in, different device
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  audit_log_id bigint NOT NULL REFERENCES public.audit_logs(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(admin_user_id, audit_log_id)
);

-- The UNIQUE(admin_user_id, audit_log_id) constraint already creates an index
-- that efficiently covers lookups by admin_user_id (leading column).

-- ============================================================
-- GRANT service_role access
--
-- This table was created AFTER the batch GRANT in 20260820_full_schema.sql,
-- so it needs explicit GRANTs. Without this, the application (which uses
-- SUPABASE_SECRET_KEY / service_role) cannot read or write the table.
-- ============================================================

-- Minimum required: SELECT (list reads), INSERT (mark read), UPSERT (mark single read)
-- No DELETE operations are performed on this table
GRANT SELECT, INSERT, UPDATE ON public.admin_notification_reads TO service_role;
REVOKE ALL ON public.admin_notification_reads FROM anon, authenticated;

-- ============================================================
-- ROW LEVEL SECURITY — Defense-in-depth
--
-- ARCHITECTURE NOTE:
-- The application uses SUPABASE_SECRET_KEY (service role) via
-- createDatabaseClient(), which bypasses RLS by default.
-- Real authorization is enforced application-layer:
--   Clerk auth → active admin_users → role_id → roles → role_permissions
--
-- RLS here protects against:
--   1. Accidental anon key usage in future code
--   2. Direct Supabase client exposure
--   3. Defense-in-depth if architecture changes
-- ============================================================

ALTER TABLE public.admin_notification_reads ENABLE ROW LEVEL SECURITY;

-- Permissive policy for service_role (matching RBAC tables pattern).
-- service_role bypasses RLS by default in Supabase, but this policy
-- ensures consistency and defense-in-depth.
DROP POLICY IF EXISTS "Service role full access" ON public.admin_notification_reads;
CREATE POLICY "Service role full access" ON public.admin_notification_reads
  FOR ALL USING (true) WITH CHECK (true);

-- No public/anonymous/anon access. All access must go through
-- server-side Admin functions with Clerk authentication.

-- Verify the security chain for every function accessing this table:
--
-- getCurrentAdminId():
--   1. Clerk auth() → userId
--   2. admin_users.clerk_user_id match → admin_user_id
--   3. admin_user_id is server-derived, NEVER from browser
--
-- adminListSecurityNotifications:
--   requirePermission("audit.view") → active admin with audit permission
--
-- adminMarkNotificationRead:
--   requirePermission("audit.view") → active admin with audit permission
--   getCurrentAdminId() → server-derived admin_user_id
--
-- adminMarkAllNotificationsRead:
--   requirePermission("audit.view") → active admin with audit permission
--   getCurrentAdminId() → server-derived admin_user_id
