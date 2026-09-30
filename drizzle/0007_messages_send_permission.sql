-- ============================================================================
-- 0007 — Communications send permission
-- ============================================================================
-- Sending to real people is a separate capability from editing records. Until
-- now the permission set had no way to express "may operate communications",
-- so a member with contacts:write could, in principle, be handed a send button.
--
-- This adds one permission and grants it to owner, admin and manager. member and
-- viewer deliberately keep zero send capability. Nothing else changes: the
-- permission is only meaningful because the Communications Center calls
-- app.has_permission('messages:send') inside the tenant transaction before it
-- enqueues anything.
--
-- Idempotent: safe to re-run.
-- ============================================================================

insert into public.permissions (key, name, description)
values (
  'messages:send',
  'Send communications',
  'Queue and operate email/SMS sends to contacts, within consent and suppression rules'
)
on conflict (key) do nothing;

do $$
declare
  v_permission uuid;
  v_role text;
begin
  select id into v_permission from public.permissions where key = 'messages:send';
  if v_permission is null then
    raise exception 'messages:send permission missing after insert';
  end if;

  foreach v_role in array array['owner', 'admin', 'manager']
  loop
    insert into public.role_permissions (role_id, permission_id)
    select r.id, v_permission from public.roles r where r.key = v_role
    on conflict do nothing;
  end loop;
end $$;

-- Prove the grant landed where it was intended.
do $$
declare
  v_owner int;
  v_member int;
begin
  select count(*) into v_owner
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
   where r.key = 'owner' and p.key = 'messages:send';

  select count(*) into v_member
    from public.roles r
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
   where r.key = 'member' and p.key = 'messages:send';

  if v_owner <> 1 then
    raise exception 'owner did not receive messages:send';
  end if;
  if v_member <> 0 then
    raise exception 'member must not receive messages:send';
  end if;
end $$;
