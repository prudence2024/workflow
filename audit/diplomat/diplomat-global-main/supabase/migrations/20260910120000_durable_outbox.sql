-- DURABLE OUTBOX — OWNER-GATED MIGRATION (DO NOT APPLY AUTOMATICALLY)
--
-- Status: PREPARED, NOT APPLIED. Preview and Production share the same
-- Supabase database, so applying this migration is a live schema change and
-- requires the Owner's explicit approval (MIGRATION OUTBOX_GATE=REQUIRED).
--
-- Purpose: durable outbound-event log for transactional email, admin
-- notifications and Telegram messages. Financial completion must never
-- depend on message delivery; this table records what was attempted so that
-- safe retries and truthful status reporting are possible.
--
-- Application procedure (for the Owner):
--   1. Confirm no in-flight payment finalization (brief maintenance window).
--   2. Apply in the Supabase SQL editor with the statement below.
--   3. Verify: select * from outbox_events limit 5; and confirm RLS is on.
--   4. Rollback: drop table if exists public.outbox_events;
--      (safe — no existing tables reference it)

create table if not exists public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (
    event_type in ('transactional_email', 'admin_notification', 'telegram_message')
  ),
  -- Idempotency: caller-supplied key (e.g. receipt:<id>:email). Re-running a
  -- retried event must not duplicate delivery.
  idempotency_key text not null unique,
  resource_id uuid,
  resource_type text,
  provider text not null,
  provider_message_id text,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  status text not null default 'pending' check (
    status in ('pending', 'sent', 'failed', 'exhausted', 'ambiguous')
  ),
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists outbox_events_status_idx
  on public.outbox_events (status, created_at);
create index if not exists outbox_events_resource_idx
  on public.outbox_events (resource_type, resource_id);

alter table public.outbox_events enable row level security;

-- No public policies: only the service role (server) may read/write.
-- This is deliberate — the outbox is a privileged internal queue.
