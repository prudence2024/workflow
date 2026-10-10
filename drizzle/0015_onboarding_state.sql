alter table public.users
  add column if not exists onboarding_stage text not null default 'plan',
  add column if not exists onboarding_plan text,
  add column if not exists onboarding_workspace_type text,
  add column if not exists onboarding_phone text,
  add column if not exists onboarding_phone_verified_at timestamptz;

alter table public.users
  drop constraint if exists users_onboarding_stage_check;

alter table public.users
  add constraint users_onboarding_stage_check
  check (onboarding_stage in ('auth_complete', 'plan', 'workspace', 'details', 'phone_verification', 'payment', 'complete'));

alter table public.users
  drop constraint if exists users_onboarding_plan_check;

alter table public.users
  add constraint users_onboarding_plan_check
  check (onboarding_plan is null or onboarding_plan in ('free', 'pro', 'plus'));

alter table public.users
  drop constraint if exists users_onboarding_workspace_type_check;

alter table public.users
  add constraint users_onboarding_workspace_type_check
  check (onboarding_workspace_type is null or onboarding_workspace_type in ('personal', 'organization'));
