-- ============================================================================
-- 0005 — Correct the permission key used by membership management functions
-- ============================================================================
-- Found by the tenant-isolation suite: app.create_invitation, app.set_member_role
-- and app.set_member_status checked 'members.manage' (dot) while the seeded
-- permission key is 'members:manage' (colon). The guards therefore denied every
-- request, including legitimate owner actions, for the wrong reason. The guard
-- itself is correct — only the key literal was wrong.
--
-- 0002 is intentionally left untouched (it is already applied); this migration
-- redefines the affected functions. Idempotent: safe to re-run.
-- ============================================================================

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
  if not app.has_permission('members:manage') then
    raise exception 'missing permission: members:manage' using errcode = '42501';
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
  if not app.has_permission('members:manage') then
    raise exception 'missing permission: members:manage' using errcode = '42501';
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
  if not app.has_permission('members:manage') then
    raise exception 'missing permission: members:manage' using errcode = '42501';
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
