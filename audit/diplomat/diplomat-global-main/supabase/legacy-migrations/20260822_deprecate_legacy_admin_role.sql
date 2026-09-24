-- 20260822_deprecate_legacy_admin_role.sql
-- Non-destructive RBAC reconciliation.
-- role_id is the authoritative role assignment.
-- Legacy role text column is retained temporarily for backward compatibility.
-- No users or role assignments are deleted.

BEGIN;

-- 1. Safety check BEFORE changing anything.
-- Every active admin must already have a valid role_id.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.admin_users au
    LEFT JOIN public.roles r ON r.id = au.role_id
    WHERE au.active = true
      AND (au.role_id IS NULL OR r.id IS NULL)
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: one or more active admin_users have no valid role_id. Review RBAC assignments first.';
  END IF;
END $$;

-- 2. Safety-net the legacy Owner record if an old owner row exists
-- without role_id. This should normally update zero rows.
UPDATE public.admin_users
SET role_id = (
  SELECT id
  FROM public.roles
  WHERE key = 'owner'
  LIMIT 1
)
WHERE role = 'owner'
  AND role_id IS NULL;

-- 3. Re-check after Owner safety-net.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.admin_users au
    LEFT JOIN public.roles r ON r.id = au.role_id
    WHERE au.active = true
      AND (au.role_id IS NULL OR r.id IS NULL)
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: active admin_users still exist without a valid role_id.';
  END IF;
END $$;

-- 4. Remove the legacy DEFAULT 'admin'.
-- New application code should assign role_id explicitly.
ALTER TABLE public.admin_users
  ALTER COLUMN role DROP DEFAULT;

-- 5. Make the legacy text role nullable.
ALTER TABLE public.admin_users
  ALTER COLUMN role DROP NOT NULL;

-- 6. Remove the restrictive legacy CHECK constraint.
ALTER TABLE public.admin_users
  DROP CONSTRAINT IF EXISTS admin_users_role_check;

-- 7. Document the transitional column clearly.
COMMENT ON COLUMN public.admin_users.role IS
  'DEPRECATED: legacy role text retained temporarily for backward compatibility. Authorization must use role_id -> roles -> role_permissions -> permissions.';

COMMIT;
