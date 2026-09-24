-- ============================================================
-- Add email column to admin_users
-- Required for staff invitation flow: admin invites by email,
-- row is created with pending status, real Clerk ID linked on
-- first sign-up. Previously, email was incorrectly stored in
-- clerk_user_id, which broke authentication.
-- ============================================================

ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS email text;
CREATE INDEX IF NOT EXISTS admin_users_email_idx ON public.admin_users(email) WHERE email IS NOT NULL;
