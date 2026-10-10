-- Keep workspace type and pending plan intent inside the privileged,
-- transaction-scoped bootstrap function. The restricted application role is
-- intentionally not allowed to update workspace_type or subscription state
-- directly after creation.
create or replace function app.create_organization_with_options(
  p_name text,
  p_slug_base text,
  p_workspace_type text,
  p_requested_plan_key text default null
)
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
  if p_workspace_type not in ('personal', 'organization') then
    raise exception 'invalid workspace type' using errcode = '22023';
  end if;
  if p_requested_plan_key is not null and p_requested_plan_key not in ('free', 'pro', 'plus') then
    raise exception 'invalid requested plan' using errcode = '22023';
  end if;

  select id into v_role from public.roles where key = 'owner';
  if v_role is null then
    raise exception 'owner role is not provisioned' using errcode = '55000';
  end if;

  v_slug := coalesce(nullif(btrim(p_slug_base), ''), 'workspace');
  loop
    begin
      insert into public.organizations (name, slug, plan_key, workspace_type)
      values (btrim(p_name), v_slug, 'free', p_workspace_type)
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

  insert into public.subscriptions (org_id, plan_key, requested_plan_key, status, billing_state)
  values (
    v_org,
    'free',
    nullif(p_requested_plan_key, 'free'),
    case when p_requested_plan_key is null or p_requested_plan_key = 'free' then 'active' else 'pending' end,
    case when p_requested_plan_key is null or p_requested_plan_key = 'free' then 'active' else 'pending_payment' end
  );

  insert into public.audit_logs (org_id, user_id, action, entity_type, entity_id, metadata)
  values (v_org, v_user, 'organization_created', 'organization', v_org::text,
          jsonb_build_object('name', btrim(p_name), 'slug', v_slug, 'workspace_type', p_workspace_type));

  perform set_config('app.current_org_id', v_org::text, true);
  return v_org;
end $$;

revoke all on function app.create_organization_with_options(text, text, text, text) from public;
grant execute on function app.create_organization_with_options(text, text, text, text) to workflow_app;
