-- ============================================================================
-- 0002 — Tenant isolation, least-privilege roles and privileged bootstrap
-- ============================================================================
-- Adapted from the Diplomat Global (Supabase) audit — deliberately NOT copied.
--
-- Supabase's model leans on a single service_role key that holds BYPASSRLS.
-- On THIS Neon project, neondb_owner also has rolbypassrls = true (verified
-- live), so merely enabling RLS would enforce nothing for the application's
-- connection. Isolation here is built from three coordinated mechanisms:
--
--   1. Restricted roles WITHOUT bypassrls (workflow_app, workflow_worker).
--      Runtime code must execute as one of these. The owner connection is for
--      migrations and privileged bootstrap only.
--   2. Explicit per-table policies keyed on a transaction-scoped organisation
--      context (app.current_org_id) that cannot be forged: the only sanctioned
--      way to set it is app.set_tenant_context(), which verifies active
--      membership against the database before assigning the value.
--   3. SECURITY DEFINER functions with pinned search_path, REVOKEd from
--      PUBLIC, for bootstrap and administrative paths.
--
-- Invariant to maintain: every new tenant table must receive ENABLE + FORCE
-- RLS plus a tenant_isolation policy and explicit grants in the same migration
-- that creates it. Default privileges are intentionally NOT broadened.
-- ============================================================================

create schema if not exists app;

-- gen_random_bytes() powers invitation tokens. pgcrypto ships with Neon.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Restricted roles (created without login or secrets; provisioning of a
--    credentialed login role is a separate, explicit infrastructure step).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'workflow_app') then
    create role workflow_app nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'workflow_worker') then
    create role workflow_worker nologin noinherit;
  end if;
end $$;

-- Allow the owner connection to drop into the restricted role for tests and
-- for defence-in-depth transaction scoping.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'neondb_owner') then
    grant workflow_app to neondb_owner;
    grant workflow_worker to neondb_owner;
  end if;
end $$;

-- Defensive: the app roles must never create objects. Guarded so the
-- migration still applies if public is owned by a different role.
do $$
begin
  revoke create on schema public from public;
exception when insufficient_privilege then
  raise notice 'skipped revoking CREATE on schema public (insufficient privilege)';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Context accessors (read-only views of the transaction-scoped settings)
-- ---------------------------------------------------------------------------
create or replace function app.current_org_id()
returns uuid language sql stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('app.current_org_id', true), '')::uuid
$$;

create or replace function app.current_user_id()
returns uuid language sql stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- 3. Identity + tenant context (privileged paths, membership-verified)
-- ---------------------------------------------------------------------------

-- Resolve a verified Clerk subject to a local profile and start its session.
-- The caller supplies a Clerk id, never a local user id, so it cannot select
-- an arbitrary profile.
create or replace function app.begin_user_session(p_clerk_user_id text)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if p_clerk_user_id is null or btrim(p_clerk_user_id) = '' then
    raise exception 'clerk subject required' using errcode = '42501';
  end if;

  select id into v_id from public.users where clerk_user_id = p_clerk_user_id;
  if v_id is null then
    raise exception 'identity is not provisioned' using errcode = '42501';
  end if;

  perform set_config('app.current_user_id', v_id::text, true);
  perform set_config('app.current_org_id', '', true);
  return v_id;
end $$;

-- Provision the local profile row for an already-verified Clerk subject.
create or replace function app.upsert_local_user(
  p_clerk_user_id text,
  p_email text,
  p_name text
)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  if p_clerk_user_id is null or btrim(p_clerk_user_id) = '' then
    raise exception 'clerk subject required' using errcode = '42501';
  end if;
  if p_email is null or btrim(p_email) = '' then
    raise exception 'email required' using errcode = '42501';
  end if;

  select id into v_id from public.users where clerk_user_id = p_clerk_user_id;
  if v_id is null then
    select id into v_id from public.users where lower(email) = lower(btrim(p_email));
    if v_id is not null then
      update public.users
         set clerk_user_id = p_clerk_user_id,
             email_verified = true
       where id = v_id and clerk_user_id is null;
    end if;
  end if;

  if v_id is null then
    insert into public.users (clerk_user_id, email, name, email_verified)
    values (p_clerk_user_id, lower(btrim(p_email)), coalesce(nullif(btrim(p_name), ''), 'Member'), true)
    returning id into v_id;
  end if;

  -- A different Clerk subject already owns this email: fail closed rather
  -- than merging two identities into one profile.
  if exists (
    select 1 from public.users u
     where u.id = v_id and u.clerk_user_id is not null and u.clerk_user_id <> p_clerk_user_id
  ) then
    raise exception 'this email is already linked to another identity' using errcode = '42501';
  end if;

  update public.users set email_verified = true where id = v_id;

  return v_id;
end $$;

-- Set the tenant context. Membership is verified in the database, so a
-- browser-supplied organisation id that the user does not belong to fails
-- closed (SQLSTATE 42501) instead of silently returning another tenant's data.
create or replace function app.set_tenant_context(p_org_id uuid)
returns table (org_id uuid, role_id uuid, role_key text)
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid;
  v_role_id uuid;
  v_role_key text;
  v_status text;
begin
  v_user := app.current_user_id();
  if v_user is null then
    raise exception 'no session identity in context' using errcode = '42501';
  end if;
  if p_org_id is null then
    raise exception 'organization id required' using errcode = '42501';
  end if;

  select m.role_id, coalesce(r.key, m.role), m.status
    into v_role_id, v_role_key, v_status
    from public.organization_members m
    left join public.roles r on r.id = m.role_id
   where m.user_id = v_user and m.org_id = p_org_id;

  if not found or v_status is distinct from 'active' then
    raise exception 'not an active member of this organization' using errcode = '42501';
  end if;

  perform set_config('app.current_org_id', p_org_id::text, true);
  return query select p_org_id, v_role_id, v_role_key;
end $$;

-- Clear tenant context (org switching must not leak the previous tenant).
create or replace function app.clear_tenant_context()
returns void language plpgsql
set search_path = pg_catalog
as $$
begin
  perform set_config('app.current_org_id', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Read models for the application shell
-- ---------------------------------------------------------------------------
create or replace function app.user_organizations()
returns table (org_id uuid, org_name text, org_slug text, plan_key text, role_key text)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select o.id, o.name, o.slug, o.plan_key, coalesce(r.key, m.role)
    from public.organization_members m
    join public.organizations o on o.id = m.org_id
    left join public.roles r on r.id = m.role_id
   where m.user_id = app.current_user_id()
     and m.status = 'active'
   order by o.created_at
$$;

create or replace function app.current_permissions()
returns setof text language sql stable security definer
set search_path = pg_catalog, public
as $$
  select p.key
    from public.organization_members m
    join public.role_permissions rp on rp.role_id = m.role_id
    join public.permissions p on p.id = rp.permission_id
   where m.user_id = app.current_user_id()
     and m.org_id = app.current_org_id()
     and m.status = 'active'
$$;

create or replace function app.has_permission(p_permission_key text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from app.current_permissions() k
     where k = p_permission_key
  )
$$;

-- ---------------------------------------------------------------------------
-- 5. Atomic organisation provisioning (first owner)
--    The actor is taken from the verified session context, never from the
--    request body, so a client cannot assign itself ownership of a workspace
--    it did not create.
-- ---------------------------------------------------------------------------
create or replace function app.create_organization(p_name text, p_slug_base text)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid;
  v_org uuid;
  v_role uuid;
  v_slug text;
  v_attempt int := 0;
begin
  v_user := app.current_user_id();
  if v_user is null then
    raise exception 'no session identity in context' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'organization name required' using errcode = '22023';
  end if;

  select id into v_role from public.roles where key = 'owner';
  if v_role is null then
    raise exception 'owner role is not provisioned' using errcode = '55000';
  end if;

  v_slug := coalesce(nullif(btrim(p_slug_base), ''), 'workspace');

  loop
    begin
      insert into public.organizations (name, slug, plan_key)
      values (btrim(p_name), v_slug, 'free')
      returning id into v_org;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt > 25 then
        raise exception 'could not allocate a unique workspace slug' using errcode = '23505';
      end if;
      v_slug := coalesce(nullif(btrim(p_slug_base), ''), 'workspace') || '-' || v_attempt;
    end;
  end loop;

  insert into public.organization_members (org_id, user_id, role, role_id, status)
  values (v_org, v_user, 'owner', v_role, 'active');

  insert into public.subscriptions (org_id, plan_key, status)
  values (v_org, 'free', 'active');

  insert into public.audit_logs (org_id, user_id, action, entity_type, entity_id, metadata)
  values (v_org, v_user, 'organization_created', 'organization', v_org::text,
          jsonb_build_object('name', btrim(p_name), 'slug', v_slug));

  perform set_config('app.current_org_id', v_org::text, true);
  return v_org;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Membership management (permission-checked, escalation-safe)
-- ---------------------------------------------------------------------------
create or replace function app.create_invitation(p_org_id uuid, p_email text, p_role_key text)
returns text language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid;
  v_role uuid;
  v_token text;
begin
  v_user := app.current_user_id();
  if v_user is null then
    raise exception 'no session identity in context' using errcode = '42501';
  end if;
  if app.current_org_id() is distinct from p_org_id then
    raise exception 'organization context mismatch' using errcode = '42501';
  end if;
  if not app.has_permission('members.manage') then
    raise exception 'missing permission: members.manage' using errcode = '42501';
  end if;

  select id into v_role from public.roles where key = coalesce(nullif(btrim(p_role_key), ''), 'member');
  if v_role is null then
    raise exception 'unknown role' using errcode = '22023';
  end if;
  if coalesce(nullif(btrim(p_role_key), ''), 'member') = 'owner' then
    raise exception 'the owner role cannot be granted by invitation' using errcode = '42501';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.organization_invitations (org_id, email, role, token, status, invited_by_user_id, expires_at)
  values (p_org_id, lower(btrim(p_email)), coalesce(nullif(btrim(p_role_key), ''), 'member'), v_token,
          'pending', v_user, now() + interval '14 days');

  insert into public.audit_logs (org_id, user_id, action, entity_type, metadata)
  values (p_org_id, v_user, 'invitation_created', 'organization_invitation',
          jsonb_build_object('email', lower(btrim(p_email)), 'role', coalesce(nullif(btrim(p_role_key), ''), 'member')));

  return v_token;
end $$;

create or replace function app.accept_invitation(p_token text)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid;
  v_email text;
  v_inv record;
  v_role uuid;
begin
  v_user := app.current_user_id();
  if v_user is null then
    raise exception 'no session identity in context' using errcode = '42501';
  end if;

  select email into v_email from public.users where id = v_user;

  select i.*, r.id as resolved_role_id
    into v_inv
    from public.organization_invitations i
    left join public.roles r on r.key = i.role
   where i.token = p_token
     and i.status = 'pending'
     and i.expires_at > now()
     and lower(i.email) = lower(v_email);

  if not found then
    raise exception 'invitation not found, expired, or addressed to another identity' using errcode = '42501';
  end if;

  v_role := v_inv.resolved_role_id;

  insert into public.organization_members (org_id, user_id, role, role_id, status)
  values (v_inv.org_id, v_user, v_inv.role, v_role, 'active')
  on conflict (org_id, user_id) do update
     set role = excluded.role,
         role_id = excluded.role_id,
         status = 'active',
         updated_at = now();

  update public.organization_invitations set status = 'accepted' where id = v_inv.id;

  insert into public.audit_logs (org_id, user_id, action, entity_type, entity_id, metadata)
  values (v_inv.org_id, v_user, 'invitation_accepted', 'organization_invitation', v_inv.id::text,
          jsonb_build_object('role', v_inv.role));

  return v_inv.org_id;
end $$;

create or replace function app.set_member_role(p_org_id uuid, p_user_id uuid, p_role_key text)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid;
  v_role uuid;
  v_actor_role text;
  v_owner_count int;
  v_target_is_owner boolean;
begin
  v_user := app.current_user_id();
  if v_user is null then
    raise exception 'no session identity in context' using errcode = '42501';
  end if;
  if app.current_org_id() is distinct from p_org_id then
    raise exception 'organization context mismatch' using errcode = '42501';
  end if;
  if not app.has_permission('members.manage') then
    raise exception 'missing permission: members.manage' using errcode = '42501';
  end if;

  select coalesce(r.key, m.role) into v_actor_role
    from public.organization_members m
    left join public.roles r on r.id = m.role_id
   where m.org_id = p_org_id and m.user_id = v_user and m.status = 'active';

  select id into v_role from public.roles where key = p_role_key;
  if v_role is null then
    raise exception 'unknown role' using errcode = '22023';
  end if;

  -- Only an owner may mint another owner.
  if p_role_key = 'owner' and v_actor_role is distinct from 'owner' then
    raise exception 'only an owner can grant the owner role' using errcode = '42501';
  end if;

  select coalesce(r.key, m.role) = 'owner'
    into v_target_is_owner
    from public.organization_members m
    left join public.roles r on r.id = m.role_id
   where m.org_id = p_org_id and m.user_id = p_user_id;

  -- Never leave a workspace ownerless.
  if coalesce(v_target_is_owner, false) and p_role_key <> 'owner' then
    select count(*) into v_owner_count
      from public.organization_members m
      left join public.roles r on r.id = m.role_id
     where m.org_id = p_org_id and m.status = 'active' and coalesce(r.key, m.role) = 'owner';
    if v_owner_count <= 1 then
      raise exception 'the last owner of a workspace cannot be demoted' using errcode = '42501';
    end if;
  end if;

  update public.organization_members
     set role = p_role_key, role_id = v_role, updated_at = now()
   where org_id = p_org_id and user_id = p_user_id;

  insert into public.audit_logs (org_id, user_id, action, entity_type, entity_id, metadata)
  values (p_org_id, v_user, 'member_role_changed', 'organization_member', p_user_id::text,
          jsonb_build_object('role', p_role_key));
end $$;

create or replace function app.set_member_status(p_org_id uuid, p_user_id uuid, p_status text)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid;
  v_owner_count int;
  v_target_is_owner boolean;
begin
  v_user := app.current_user_id();
  if v_user is null then
    raise exception 'no session identity in context' using errcode = '42501';
  end if;
  if app.current_org_id() is distinct from p_org_id then
    raise exception 'organization context mismatch' using errcode = '42501';
  end if;
  if not app.has_permission('members.manage') then
    raise exception 'missing permission: members.manage' using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended', 'revoked') then
    raise exception 'invalid membership status' using errcode = '22023';
  end if;

  select coalesce(r.key, m.role) = 'owner'
    into v_target_is_owner
    from public.organization_members m
    left join public.roles r on r.id = m.role_id
   where m.org_id = p_org_id and m.user_id = p_user_id;

  if coalesce(v_target_is_owner, false) and p_status <> 'active' then
    select count(*) into v_owner_count
      from public.organization_members m
      left join public.roles r on r.id = m.role_id
     where m.org_id = p_org_id and m.status = 'active' and coalesce(r.key, m.role) = 'owner';
    if v_owner_count <= 1 then
      raise exception 'the last owner of a workspace cannot be deactivated' using errcode = '42501';
    end if;
  end if;

  update public.organization_members
     set status = p_status, updated_at = now()
   where org_id = p_org_id and user_id = p_user_id;

  insert into public.audit_logs (org_id, user_id, action, entity_type, entity_id, metadata)
  values (p_org_id, v_user, 'member_status_changed', 'organization_member', p_user_id::text,
          jsonb_build_object('status', p_status));
end $$;

-- ---------------------------------------------------------------------------
-- 7. Platform administration — separate from customer provisioning
--    The only way to hold platform-admin is to match the server-configured
--    allowlisted subject. The table itself is deny-all for the app role.
-- ---------------------------------------------------------------------------
create or replace function app.claim_platform_admin(
  p_clerk_user_id text,
  p_allowed_clerk_user_id text,
  p_email text
)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if p_allowed_clerk_user_id is null or btrim(p_allowed_clerk_user_id) = '' then
    raise exception 'platform admin bootstrap is not configured' using errcode = '42501';
  end if;
  if p_clerk_user_id is null or btrim(p_clerk_user_id) = '' then
    raise exception 'clerk subject required' using errcode = '42501';
  end if;
  if btrim(p_clerk_user_id) <> btrim(p_allowed_clerk_user_id) then
    raise exception 'this identity may not hold platform administration' using errcode = '42501';
  end if;

  insert into public.platform_admins (clerk_user_id, email, active)
  values (btrim(p_clerk_user_id), lower(btrim(coalesce(p_email, ''))), true)
  on conflict (clerk_user_id) do update
     set active = true, revoked_at = null, email = excluded.email;

  insert into public.audit_logs (user_id, action, entity_type, metadata)
  values (app.current_user_id(), 'platform_admin_claimed', 'platform_admin',
          jsonb_build_object('clerk_user_id', btrim(p_clerk_user_id)));

  return true;
end $$;

create or replace function app.is_platform_admin_user(p_clerk_user_id text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.platform_admins a
     where a.clerk_user_id = p_clerk_user_id and a.active
  )
$$;

create or replace function app.platform_admin_overview()
returns table (
  organization_id uuid,
  organization_name text,
  plan_key text,
  member_count bigint,
  contact_count bigint,
  campaign_count bigint,
  created_at timestamptz
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select o.id,
         o.name,
         o.plan_key,
         (select count(*) from public.organization_members m where m.org_id = o.id),
         (select count(*) from public.contacts c where c.org_id = o.id),
         (select count(*) from public.campaigns c where c.org_id = o.id),
         o.created_at
    from public.organizations o
   order by o.created_at desc
   limit 200
$$;

-- ---------------------------------------------------------------------------
-- 8. Row level security: enable + force + policy on every tenant table
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('organizations',              'id'),
      ('organization_members',       'org_id'),
      ('organization_invitations',   'org_id'),
      ('custom_field_definitions',   'org_id'),
      ('contacts',                   'org_id'),
      ('tags',                       'org_id'),
      ('notes',                      'org_id'),
      ('activity_events',            'org_id'),
      ('campaigns',                  'org_id'),
      ('campaign_records',           'org_id'),
      ('imports',                    'org_id'),
      ('message_templates',          'org_id'),
      ('messages',                   'org_id'),
      ('message_events',             'org_id'),
      ('contact_channel_consents',   'org_id'),
      ('suppression_entries',        'org_id'),
      ('usage_counters',             'org_id'),
      ('subscriptions',              'org_id'),
      ('files',                      'org_id'),
      ('audit_logs',                 'org_id'),
      ('outbox_events',              'org_id')
    ) as v(table_name, scope_column)
  loop
    execute format('alter table public.%I enable row level security', t.table_name);
    execute format('alter table public.%I force row level security', t.table_name);
    execute format('drop policy if exists tenant_isolation on public.%I', t.table_name);
    execute format(
      'create policy tenant_isolation on public.%I for all to workflow_app '
      'using (%I = app.current_org_id()) with check (%I = app.current_org_id())',
      t.table_name, t.scope_column, t.scope_column
    );
  end loop;
end $$;

-- Child tables that carry no organisation column of their own.
alter table public.contact_tags enable row level security;
alter table public.contact_tags force row level security;
drop policy if exists tenant_isolation on public.contact_tags;
create policy tenant_isolation on public.contact_tags
  for all to workflow_app
  using (
    exists (
      select 1 from public.contacts c
       where c.id = contact_tags.contact_id and c.org_id = app.current_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.contacts c
       where c.id = contact_tags.contact_id and c.org_id = app.current_org_id()
    )
  );

alter table public.import_errors enable row level security;
alter table public.import_errors force row level security;
drop policy if exists tenant_isolation on public.import_errors;
create policy tenant_isolation on public.import_errors
  for all to workflow_app
  using (
    exists (
      select 1 from public.imports i
       where i.id = import_errors.import_id and i.org_id = app.current_org_id()
    )
  )
  with check (
    exists (
      select 1 from public.imports i
       where i.id = import_errors.import_id and i.org_id = app.current_org_id()
    )
  );

-- Profiles: read your own row and the rows of people you share the active
-- organisation with; write only your own display fields.
alter table public.users enable row level security;
alter table public.users force row level security;
drop policy if exists users_visible_in_context on public.users;
create policy users_visible_in_context on public.users
  for select to workflow_app
  using (
    id = app.current_user_id()
    or exists (
      select 1 from public.organization_members m
       where m.user_id = users.id
         and m.org_id = app.current_org_id()
         and m.status = 'active'
    )
  );
drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update to workflow_app
  using (id = app.current_user_id())
  with check (id = app.current_user_id());

-- Reference data: readable by the app role, writable by nobody at runtime.
do $$
declare
  t text;
begin
  foreach t in array array['roles', 'permissions', 'role_permissions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists reference_read on public.%I', t);
    execute format('create policy reference_read on public.%I for select to workflow_app using (true)', t);
  end loop;
end $$;

-- Deny-all for the app role: no policy is created on purpose.
alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;
alter table public.webhook_events enable row level security;
alter table public.webhook_events force row level security;
alter table public.sessions enable row level security;
alter table public.sessions force row level security;

-- Worker role: the durable queue is cross-tenant by design, but the worker
-- gets no access to unrelated customer tables (organisation names, profiles,
-- platform administration remain out of reach).
do $$
begin
  execute 'drop policy if exists worker_queue on public.outbox_events';
  execute 'create policy worker_queue on public.outbox_events for all to workflow_worker using (true) with check (true)';

  execute 'drop policy if exists worker_webhooks on public.webhook_events';
  execute 'create policy worker_webhooks on public.webhook_events for all to workflow_worker using (true) with check (true)';

  execute 'drop policy if exists worker_message_events on public.message_events';
  execute 'create policy worker_message_events on public.message_events for all to workflow_worker using (true) with check (true)';

  execute 'drop policy if exists worker_messages on public.messages';
  execute 'create policy worker_messages on public.messages for update to workflow_worker using (true) with check (true)';

  execute 'drop policy if exists worker_consents_read on public.contact_channel_consents';
  execute 'create policy worker_consents_read on public.contact_channel_consents for select to workflow_worker using (true)';

  execute 'drop policy if exists worker_suppression_read on public.suppression_entries';
  execute 'create policy worker_suppression_read on public.suppression_entries for select to workflow_worker using (true)';

  execute 'drop policy if exists worker_contacts_read on public.contacts';
  execute 'create policy worker_contacts_read on public.contacts for select to workflow_worker using (true)';

  execute 'drop policy if exists worker_audit_insert on public.audit_logs';
  execute 'create policy worker_audit_insert on public.audit_logs for insert to workflow_worker with check (true)';

  execute 'drop policy if exists worker_messages_read on public.messages';
  execute 'create policy worker_messages_read on public.messages for select to workflow_worker using (true)';
end $$;

-- ---------------------------------------------------------------------------
-- 9. Grants — least privilege, explicit, no broad default privileges.
-- ---------------------------------------------------------------------------
grant usage on schema public to workflow_app;
grant usage on schema app to workflow_app;
grant usage on schema public to workflow_worker;
grant usage on schema app to workflow_worker;

do $$
declare
  t text;
begin
  foreach t in array array[
    'contacts', 'tags', 'notes', 'campaigns', 'campaign_records',
    'custom_field_definitions', 'imports', 'message_templates'
  ]
  loop
    execute format('grant select, insert, update, delete on public.%I to workflow_app', t);
  end loop;
end $$;

grant select, insert, delete on public.contact_tags to workflow_app;
grant select, insert, delete on public.import_errors to workflow_app;
grant select, insert on public.activity_events to workflow_app;
grant select, insert on public.audit_logs to workflow_app;
grant select, insert, update on public.messages to workflow_app;
grant select, insert on public.message_events to workflow_app;
grant select, insert, update on public.contact_channel_consents to workflow_app;
grant select, insert, delete on public.suppression_entries to workflow_app;
grant select, insert, update on public.usage_counters to workflow_app;
grant select, insert, delete on public.files to workflow_app;
grant select, insert on public.outbox_events to workflow_app;
grant select on public.organizations to workflow_app;
grant update (name) on public.organizations to workflow_app;
grant select on public.organization_members to workflow_app;
grant select on public.organization_invitations to workflow_app;
grant select on public.subscriptions to workflow_app;
grant select on public.roles, public.permissions, public.role_permissions to workflow_app;
grant select on public.users to workflow_app;
-- Column-level write grant: the app role cannot touch is_platform_admin,
-- clerk_user_id, password_hash or email_verified. Privilege escalation via a
-- "profile update" is therefore impossible at the database level.
grant update (name, email) on public.users to workflow_app;

grant select, insert, update, delete on public.outbox_events to workflow_worker;
grant select, insert, update, delete on public.webhook_events to workflow_worker;
grant select, insert on public.message_events to workflow_worker;
grant select, update on public.messages to workflow_worker;
grant select on public.contacts to workflow_worker;
grant select on public.contact_channel_consents to workflow_worker;
grant select on public.suppression_entries to workflow_worker;
grant insert on public.audit_logs to workflow_worker;

-- Function execution: remove the implicit PUBLIC grant, then allow only the
-- restricted roles. Internal helpers are not callable by the app role.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'app.current_org_id()',
    'app.current_user_id()',
    'app.begin_user_session(text)',
    'app.upsert_local_user(text,text,text)',
    'app.set_tenant_context(uuid)',
    'app.clear_tenant_context()',
    'app.user_organizations()',
    'app.current_permissions()',
    'app.has_permission(text)',
    'app.create_organization(text,text)',
    'app.create_invitation(uuid,text,text)',
    'app.accept_invitation(text)',
    'app.set_member_role(uuid,uuid,text)',
    'app.set_member_status(uuid,uuid,text)',
    'app.claim_platform_admin(text,text,text)',
    'app.is_platform_admin_user(text)',
    'app.platform_admin_overview()'
  ]
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to workflow_app', fn);
  end loop;
end $$;

grant execute on function app.current_org_id() to workflow_worker;
grant execute on function app.current_user_id() to workflow_worker;

-- ============================================================================
-- Verification queries (run manually; expected results in brackets)
--   select rolname, rolbypassrls from pg_roles where rolname like 'workflow_%';
--     [both rows: rolbypassrls = false]
--   select count(*) from pg_policies where schemaname = 'public';
--     [policies exist for every tenant table]
--   select tablename, rowsecurity, forcerowsecurity from pg_tables
--    where schemaname = 'public' and not rowsecurity; [no rows]
-- ============================================================================
