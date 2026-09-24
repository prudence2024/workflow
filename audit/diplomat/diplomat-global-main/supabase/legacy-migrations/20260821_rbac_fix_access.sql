-- Fix: Grant service_role access to RBAC tables and create permissive RLS policies
-- The original migration used REVOKE which blocks even the service_role key

GRANT ALL ON public.roles TO service_role;
GRANT ALL ON public.permissions TO service_role;
GRANT ALL ON public.role_permissions TO service_role;

-- Ensure RLS is enabled but has permissive policies for service role
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Drop overly restrictive policies if they exist
DROP POLICY IF EXISTS "Service role full access" ON public.roles;
DROP POLICY IF EXISTS "Service role full access" ON public.permissions;
DROP POLICY IF EXISTS "Service role full access" ON public.role_permissions;

-- Create permissive policies for authenticated server functions
CREATE POLICY "Admin full access" ON public.roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admin full access" ON public.permissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admin full access" ON public.role_permissions FOR ALL USING (true) WITH CHECK (true);
