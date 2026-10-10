ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "onboarding_workspace_name" text,
  ADD COLUMN IF NOT EXISTS "onboarding_phone_pin_id" text,
  ADD COLUMN IF NOT EXISTS "onboarding_phone_sent_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "onboarding_phone_verify_attempts" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "onboarding_phone_send_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "onboarding_phone_send_window_started_at" timestamptz;
