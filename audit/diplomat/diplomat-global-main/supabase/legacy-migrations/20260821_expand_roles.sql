-- Expand the allowed roles in admin_users to match ROLE_DEFINITIONS
ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE public.admin_users ADD CONSTRAINT admin_users_role_check
  CHECK (role IN ('owner', 'admin', 'sales_manager', 'sales_rep', 'finance', 'editor', 'support', 'viewer'));
