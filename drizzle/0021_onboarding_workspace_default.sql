-- 0021 — new accounts begin onboarding at the workspace step.
-- Forward-only correction for the canonical Workspace -> Details -> Plan flow.
ALTER TABLE public.users
  ALTER COLUMN onboarding_stage SET DEFAULT 'workspace';
