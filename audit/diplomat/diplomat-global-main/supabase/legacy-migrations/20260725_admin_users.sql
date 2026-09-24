create extension if not exists pgcrypto;
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique check (length(clerk_user_id) between 8 and 255),
  role text not null default 'admin' check (role in ('owner', 'admin', 'editor', 'support')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists admin_users_active_role_idx on public.admin_users(active, role);
alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;
comment on table public.admin_users is 'Clerk identities authorized for the internal administration system. Managed only by trusted server code.';