# Provider readiness — ordered rollout (test credentials only)

> Policy: one provider at a time, test credentials first, production stays
> untouched, bulk live messaging stays off until a dedicated go-live gate.
> Current state: **all providers unconfigured** — the app degrades honestly
> (see per-provider behaviour below). No code changes are needed to start;
> only credentials + the verify steps.

Order rationale: storage first (uploads block imports UX), then email
(invites/notifications), then ops visibility (Telegram), then SMS (cost +
regulatory sensitivity), then scheduled dispatch last (needs everything else).

## 0. Rules that apply to every provider

- Secrets live in `.env.local` / deployment env only. No `NEXT_PUBLIC_*`
  secret exists anywhere (`grep NEXT_PUBLIC src/lib` returns only Clerk
  publishable key + app URL).
- Unconfigured ⇒ `skipped`/`simulated`, never `sent` (outbox), or
  fail-closed throw in production (R2).
- `sent` is recorded only with a provider-returned message id; the worker
  records `accepted`, never `delivered`. Timeouts become `ambiguous`:
  parked for a human, never auto-retried, never shown as delivered.
- Verify each provider with its "not configured" case first, then with a
  **test** key, then (separate gate) production keys.

## 1. Cloudflare R2 (uploads)

Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET` (all server-side; `src/lib/storage.ts`, SigV4 in
`src/lib/sigv4.ts`).

- Unconfigured + dev → `local` driver under `.storage/` (git-ignored).
- Unconfigured + production → `activeDriver()` **throws**; uploads refuse
  rather than silently landing on ephemeral disk.
- Keys are tenant-prefixed (`org/<orgId>/…`) with filename sanitising, so
  workspaces cannot address each other's objects.
- Verify: (a) no keys → dev upload works locally; (b) test keys →
  `isR2Configured()` true, object appears in bucket, key has org prefix;
  (c) revoke key → uploads fail loudly, app otherwise healthy.
- Credential to obtain: R2 API token with access to one dev bucket.

## 2. Resend (email)

Env: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SIGNING_SECRET`
(server-side; `src/lib/outbox.ts dispatchEmail`, invite mail in
`src/lib/email.ts`).

- Unconfigured → outbox outcome `skipped` (`email_provider_not_configured`);
  invite path returns `{ provider: "simulated" }` and records **nothing**
  (invite token itself is the credential in the DB).
- Failure handling: 5xx → retryable backoff → `exhausted`; 4xx →
  non-retryable `failed`; timeout → `ambiguous`.
- Webhooks: Svix-signed, verified in `api/webhooks/resend`; replay
  deduplicated (covered: `webhook-signature` 11/11, `http-security-check`
  end-to-end).
- Verify with a **test** key: send to a controlled address, confirm the
  outbox row flips `pending → sent` with a Resend id, and the delivered
  webhook flips the message to `accepted`.
- Credential to obtain: Resend test API key + verified test domain sender.

## 3. Telegram ops bot

Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS` (comma-separated
numeric ids), `TELEGRAM_WEBHOOK_SECRET` (server-side; `src/lib/telegram.ts`).

- Unconfigured → `skipped` (`telegram_not_configured`).
- Fail-closed allowlist: empty `TELEGRAM_ALLOWED_CHAT_IDS` ⇒ no chat may
  use the bot. Webhook without/invalid secret ⇒ 401 (covered by tests).
- Bot exposes read-only ops (`/status`, `/health`, `/usage`, `/failed`);
  no mutation commands.
- Verify: test bot token + own chat id; unknown chat id gets no response;
  wrong secret gets 401.
- Credential to obtain: BotFather test-bot token.

## 4. Termii (SMS)

Env: `TERMII_API_KEY`, `TERMII_SENDER_ID`,
`TERMII_BASE_URL` (default `https://api.ng.termii.com`),
`TERMII_WEBHOOK_SECRET` (server-side; `dispatchSms`).

- Unconfigured → `skipped` (`sms_provider_not_configured`). Same
  retry/exhaust/ambiguous contract as email. SMS last because every test
  segment costs money and sender IDs are regulated.
- Verify: test key + sender ID against Termii sandbox; confirm
  `sent` carries `message_id`; confirm DLR webhook path.
- Credential to obtain: Termii sandbox key + approved test sender ID.

## 5. Trigger.dev / worker dispatch

No Trigger.dev SDK is integrated and no `trigger.config.ts` exists — by
design for this gate. The dispatch primitive is ready and tested:

- `POST /api/worker/outbox` (`src/app/api/worker/outbox/route.ts`):
  `Authorization: Bearer $WORKER_SECRET`, fail-closed 401 without a
  secret, `timingSafeEqual` comparison, batch limit clamped 1–50.
- `processOutboxBatch` + `claimEvents` (`FOR UPDATE SKIP LOCKED`) make
  concurrent workers safe; per-outcome tally returned honestly.
- Covered: `outbox-idempotency` 5/5, hosted check worker-401 PASS.
- To schedule: any cron/Trigger.dev job POSTing the route with the secret
  on the **development** branch first. Set `WORKER_SECRET` + `WORKER_ID`
  in the scheduler env, never in the repo.

## Honest-delivery audit (this gate)

- `grep '"simulated"' src` → only the invite path, which records nothing.
- `sent` requires a provider id in all three adapters.
- Worker route maps `ambiguous` → message `unknown`, never `sent`.
- No bulk send path is reachable from the UI without `messages:send`
  (owner/admin/manager only; member/viewer hold zero send capability).
