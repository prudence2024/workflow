-- Add audit.delete permission for Owner to delete audit logs
-- This was explicitly approved by the project owner.

INSERT INTO public.permissions (id, key, name, description, created_at)
VALUES (
  gen_random_uuid(),
  'audit.delete',
  'Delete Audit Logs',
  'Delete past audit log entries. Owner-only by default.',
  now()
)
ON CONFLICT DO NOTHING;

-- Assign audit.delete to Owner role only by default
-- Owner can later grant it to other roles via the role permission editor
DO $$
DECLARE
  owner_role_id uuid;
  perm_id uuid;
BEGIN
  SELECT id INTO owner_role_id FROM public.roles WHERE key = 'owner' LIMIT 1;
  SELECT id INTO perm_id FROM public.permissions WHERE key = 'audit.delete' LIMIT 1;
  
  IF owner_role_id IS NOT NULL AND perm_id IS NOT NULL THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    VALUES (owner_role_id, perm_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

COMMENT ON COLUMN public.permissions.key IS 'audit.delete allows permanent deletion of past audit log entries.';
