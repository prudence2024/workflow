-- ============================================================================
-- 0006 — Database-verified legacy sessions + read-path grants
-- ============================================================================
-- Why this exists
-- ---------------
-- Tenant isolation only holds if customer requests execute as a role WITHOUT
-- rolbypassrls. Every page therefore has to run inside
--   begin_*_session() -> set_tenant_context() -> SET LOCAL ROLE workflow_app
--
-- app.begin_user_session() covers Clerk-verified identities, because Clerk has
-- already proven the subject. Accounts created before the Clerk migration have
-- no Clerk subject yet, so they need an equivalent entry point.
--
-- The naive version would be app.begin_legacy_session(p_user_id uuid) — but that
-- would accept a caller-asserted identity, which is exactly the class of bug RLS
-- is meant to stop. Instead the function takes the *session token* and looks it
-- up itself, so the database verifies the secret rather than trusting the
-- application to have done so. Application code can only pass a value it
-- genuinely received from an httpOnly cookie; it can never name a user.
--
-- Row level security is unchanged by this migration: the function sets the
-- identity guc only, and every tenant read still requires a verifiable
-- membership path (app.set_tenant_context).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Legacy session bootstrap (secret-verified, never id-verified)
-- ---------------------------------------------------------------------------
create or replace function app.begin_legacy_session(p_session_token text)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid;
begin
  if p_session_token is null or btrim(p_session_token) = '' then
    raise exception 'session token required' using errcode = '42501';
  end if;

  select s.user_id into v_user
    from public.sessions s
   where s.id = btrim(p_session_token)
     and s.expires_at > now();

  if v_user is null then
    raise exception 'invalid or expired session' using errcode = '42501';
  end if;

  -- Never inherit a previous tenant context on a pooled connection.
  perform set_config('app.current_user_id', v_user::text, true);
  perform set_config('app.current_org_id', '', true);
  return v_user;
end $$;

comment on function app.begin_legacy_session(text) is
  'Bootstraps a pre-Clerk session from its secret token. The token is verified in the database; an application can never assert a user id here.';

-- ---------------------------------------------------------------------------
-- 2. Revoke the session token from the app role's reach
-- ---------------------------------------------------------------------------
-- public.sessions is deny-all for workflow_app (FORCE RLS, no policy), so the
-- app role cannot read, forge or extend a session row. Only this definer
-- function can act on them.
do $$
begin
  execute 'revoke all on public.sessions from workflow_app';
exception when undefined_object then
  raise notice 'sessions grants already absent';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Execute grant for the new entry point
-- ---------------------------------------------------------------------------
do $$
begin
  revoke all on function app.begin_legacy_session(text) from public;
  grant execute on function app.begin_legacy_session(text) to workflow_app;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Read-path grants
-- ---------------------------------------------------------------------------
-- The Communications Center reads messages, provider evidence and template
-- bodies through the restricted role, so those selects must be explicit. Writes
-- stay as narrow as before; nothing here broadens a write path.
grant select on public.message_events to workflow_app;
grant select on public.usage_counters to workflow_app;
grant select on public.contacts to workflow_app;
grant select on public.campaign_records to workflow_app;

-- ---------------------------------------------------------------------------
-- 5. Invariant assertion
-- ---------------------------------------------------------------------------
-- Fail the migration loudly if any tenant table is left without FORCE RLS, so a
-- future migration cannot silently create an unprotected table.
do $$
declare
  v_missing text;
begin
  select string_agg(c.relname, ', ') into v_missing
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relname in (
       'users','organizations','organization_members','organization_invitations',
       'contacts','contact_tags','tags','notes','activity_events','campaigns',
       'campaign_records','imports','import_errors','custom_field_definitions',
       'message_templates','messages','message_events','contact_channel_consents',
       'suppression_entries','usage_counters','subscriptions','files','audit_logs',
       'outbox_events','webhook_events','platform_admins','roles','permissions',
       'role_permissions','sessions'
     )
     and not c.relforcerowsecurity;

  if v_missing is not null then
    raise exception 'tables missing FORCE ROW LEVEL SECURITY: %', v_missing;
  end if;
end $$;
