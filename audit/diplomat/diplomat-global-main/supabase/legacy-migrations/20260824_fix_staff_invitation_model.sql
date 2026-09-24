-- ============================================================
-- FIX STAFF INVITATION MODEL
-- Replaces: 20260823_add_admin_email_column.sql
--           20260823_add_admin_avatar_url.sql
--
-- What this migration does:
-- 1. Adds `email` column (nullable) for pending invitations
-- 2. Adds `avatar_url` column (nullable) for persistent avatars
-- 3. Makes `clerk_user_id` nullable (was NOT NULL)
-- 4. Migrates existing `pending:<uuid>` rows to use NULL
--    clerk_user_id and populates email from the pending ID's
--    associated row
-- 5. Preserves all real Clerk user IDs unchanged
--
-- PostgreSQL allows multiple NULLs in a UNIQUE column,
-- so the existing UNIQUE constraint on clerk_user_id is safe
-- to keep — it protects real Clerk IDs while allowing NULLs
-- for pending invitations.
--
-- ROLLBACK:
--   NOTE: You cannot simply restore NOT NULL on clerk_user_id
--   while valid pending invitations have NULL values. To roll
--   back, first delete all rows where clerk_user_id IS NULL
--   (pending invitations), then:
--   ALTER TABLE public.admin_users ALTER COLUMN clerk_user_id SET NOT NULL;
--   ALTER TABLE public.admin_users DROP COLUMN IF EXISTS email;
--   ALTER TABLE public.admin_users DROP COLUMN IF EXISTS avatar_url;
--   DROP INDEX IF EXISTS admin_users_email_idx;
--   DROP INDEX IF EXISTS admin_users_pending_email_uniq;
-- ============================================================

BEGIN;

-- 1. Add email column (nullable, for pending invitations)
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS email text;

-- 2. Add avatar_url column (nullable, for persistent Cloudinary avatars)
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS avatar_url text;

-- 3. Make clerk_user_id nullable
--    Only drop NOT NULL — PostgreSQL CHECK constraints permit NULL/unknown,
--    so the existing length CHECK is safe to retain.
ALTER TABLE public.admin_users ALTER COLUMN clerk_user_id DROP NOT NULL;

-- 4. Migrate existing `pending:<uuid>` rows
--    Extract email from the pending ID pattern, normalize, set clerk_user_id to NULL.
--    Only extract the leading 'pending:' prefix, not all occurrences.
UPDATE public.admin_users
SET
  email = LOWER(TRIM(SUBSTRING(clerk_user_id FROM 'pending:(.*)'))),
  clerk_user_id = NULL
WHERE clerk_user_id LIKE 'pending:%';

-- Normalize any existing email values: trim, lowercase, empty → NULL
UPDATE public.admin_users
SET email = NULL
WHERE email IS NOT NULL AND TRIM(LOWER(email)) = '';

UPDATE public.admin_users
SET email = LOWER(TRIM(email))
WHERE email IS NOT NULL;

-- 5. Add index for email lookups (auto-link in getAdminAccess)
CREATE INDEX IF NOT EXISTS admin_users_email_idx
  ON public.admin_users(email)
  WHERE email IS NOT NULL;

-- 6. Add unique partial index preventing duplicate pending invitations
--    for the same normalized email (only where clerk_user_id is NULL = pending)
DO $$
BEGIN
  -- Check for existing duplicates before creating unique index
  IF EXISTS (
    SELECT email, COUNT(*)
    FROM public.admin_users
    WHERE email IS NOT NULL AND clerk_user_id IS NULL
    GROUP BY email
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate pending invitations found for the same email. Resolve duplicates before applying this migration.';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS admin_users_pending_email_uniq
    ON public.admin_users(LOWER(email))
    WHERE email IS NOT NULL AND clerk_user_id IS NULL;
END $$;

-- 7. Verify no synthetic IDs remain — abort if any pending: rows still exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.admin_users WHERE clerk_user_id LIKE 'pending:%') THEN
    RAISE EXCEPTION 'Some pending: clerk_user_ids still exist after migration. Manual review needed.';
  END IF;
END $$;

COMMIT;
