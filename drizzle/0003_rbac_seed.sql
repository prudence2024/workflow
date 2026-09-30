-- ============================================================================
-- 0003 — Seed system roles and permissions
-- ============================================================================
-- These keys and their role mappings mirror the permission matrix already
-- shipped in src/lib/rbac.ts, so database-driven authorization preserves the
-- existing product behaviour instead of redefining it.
--
-- Ids are supplied explicitly with gen_random_uuid() rather than relying on a
-- column default: this migration must be order-independent, because relying on
-- the default (added by a later migration) made it fail on a fresh database,
-- and that failure was silently swallowed by the migration tool.
-- Idempotent: safe to re-run on any branch.
-- ============================================================================

insert into public.roles (id, key, name, description, is_system) values
  (gen_random_uuid(), 'owner',   'Owner',         'Full workspace control including billing, team and workspace settings.', true),
  (gen_random_uuid(), 'admin',   'Administrator', 'Manages members, records, campaigns and communications. No billing access.', true),
  (gen_random_uuid(), 'manager', 'Manager',       'Runs campaigns, imports, templates and reports.', true),
  (gen_random_uuid(), 'member',  'Member',        'Creates and edits records and runs imports.', true),
  (gen_random_uuid(), 'viewer',  'Viewer',        'Read-only access to workspace data.', true)
on conflict (key) do nothing;

insert into public.permissions (id, key, name, description) values
  (gen_random_uuid(), 'org:manage',       'Manage workspace',   'Rename and configure the workspace'),
  (gen_random_uuid(), 'org:billing',      'Manage billing',     'Change plan and payment details'),
  (gen_random_uuid(), 'members:manage',   'Manage members',     'Invite members and change roles'),
  (gen_random_uuid(), 'contacts:write',   'Write records',      'Create and edit records'),
  (gen_random_uuid(), 'contacts:delete',  'Delete records',     'Delete or archive records'),
  (gen_random_uuid(), 'campaigns:write',  'Write campaigns',    'Create and edit campaigns'),
  (gen_random_uuid(), 'campaigns:run',    'Run campaigns',      'Start, pause and retry campaigns'),
  (gen_random_uuid(), 'imports:write',    'Run imports',        'Upload, map and commit imports'),
  (gen_random_uuid(), 'templates:write',  'Write templates',    'Create and edit message templates'),
  (gen_random_uuid(), 'reports:export',   'Export reports',     'Export workspace reports'),
  (gen_random_uuid(), 'settings:write',   'Write settings',     'Change workspace settings and custom fields')
on conflict (key) do nothing;

with matrix(role_key, perm_key) as (values
  ('owner',   'org:manage'),   ('owner',   'org:billing'),   ('owner',   'members:manage'),
  ('owner',   'contacts:write'),('owner',  'contacts:delete'),('owner',   'campaigns:write'),
  ('owner',   'campaigns:run'), ('owner',  'imports:write'),  ('owner',   'templates:write'),
  ('owner',   'reports:export'),('owner',  'settings:write'),
  ('admin',   'members:manage'),('admin',  'contacts:write'), ('admin',   'contacts:delete'),
  ('admin',   'campaigns:write'),('admin', 'campaigns:run'),  ('admin',   'imports:write'),
  ('admin',   'templates:write'),('admin', 'reports:export'), ('admin',   'settings:write'),
  ('manager', 'contacts:write'),('manager','campaigns:write'),('manager', 'campaigns:run'),
  ('manager', 'imports:write'), ('manager','templates:write'),('manager', 'reports:export'),
  ('member',  'contacts:write'),('member', 'imports:write')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from matrix m
  join public.roles r on r.key = m.role_key
  join public.permissions p on p.key = m.perm_key
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Verification (expected: 5 roles, 11 permissions, 28 role_permission rows)
--   select count(*) from public.roles;             -- 5
--   select count(*) from public.permissions;       -- 11
--   select count(*) from public.role_permissions;  -- 28
-- ---------------------------------------------------------------------------
