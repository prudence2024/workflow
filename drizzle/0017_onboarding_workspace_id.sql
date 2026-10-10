ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "onboarding_workspace_id" uuid;

CREATE INDEX IF NOT EXISTS "users_onboarding_workspace_idx"
  ON "users" ("onboarding_workspace_id");
