# Migrations 0000 → 0007 — apply and rollback

> Scope: Neon **development** branch only. Nothing here runs against
> production automatically — CI has no database secrets and never
> migrates (see `.github/workflows/ci.yml`). A production migration is a
> manual, reviewed operation with a branch backup taken first.

## Runner

`node scripts/db-migrate.mjs [--dry-run]` applies `drizzle/meta/_journal.json`
entries in order. Each migration runs in its own transaction; the content
hash of every applied file is recorded in `drizzle.__drizzle_migrations`
(the same ledger shape Drizzle itself uses), so re-runs skip what is already
applied and stop loudly on the first failure. `--dry-run` lists
`skip`/`pending` without changing anything and always exits 0.

Prerequisites (development only):

```bash
cp .env.example .env.local
# DATABASE_URL_UNPOOLED=<direct Neon development endpoint>
# NEON_BRANCH=development
node scripts/db-migrate.mjs --dry-run   # inspect pending first
node scripts/db-migrate.mjs             # apply
```

Use the **direct** (unpooled) endpoint for migrations; DDL through the
pooler is unreliable. `drizzle.config.ts` enforces the same split.

Verified state (2026-09-30, development branch): **8 of 8 recorded,
30 public tables**.

## What each migration does

| # | File | Purpose | Idempotent / re-runnable |
|---|------|---------|--------------------------|
| 0000 | `0000_baseline.sql` | Base schema: all application tables (users, orgs, members, contacts, campaigns, imports, templates, messages, outbox, audit, …). | No — runs once on a fresh branch. |
| 0001 | `0001_rbac_outbox_consent.sql` | RBAC tables plus consent, outbox and suppression tables. | Schema DDL; runs once. |
| 0002 | `0002_tenant_rls.sql` | Tenant isolation: `workflow_app` / `workflow_worker` roles **without** BYPASSRLS, per-table RLS policies keyed on transaction-scoped `app.current_org_id()`, privileged functions (`begin_user_session`, `set_tenant_context`, `has_permission`, …). | `CREATE … IF NOT EXISTS` / `CREATE OR REPLACE` throughout. |
| 0003 | `0003_rbac_seed.sql` | Seeds roles (owner/admin/manager/member/viewer), permissions and the role→permission matrix. Supplies explicit `gen_random_uuid()` ids so a fresh branch does not depend on the later 0004 defaults. | Yes — `ON CONFLICT DO NOTHING`. |
| 0004 | `0004_id_defaults.sql` | `gen_random_uuid()` defaults for every `id` column. | Yes — `ALTER … SET DEFAULT` is stable. |
| 0005 | `0005_permission_key_fix.sql` | Fixes `members.manage` → `members:manage` in `create_invitation`, `set_member_role`, `set_member_status` (found by the tenant-isolation suite). | Yes — `CREATE OR REPLACE FUNCTION`. |
| 0006 | `0006_legacy_session_and_grants.sql` | Secret-verified `app.begin_legacy_session(token)` for pre-Clerk accounts (the database verifies the session secret; the app can never assert a user id), revokes `public.sessions` from `workflow_app`, grants read paths for the Communications Center, and asserts every tenant table has FORCE RLS. | Yes — `CREATE OR REPLACE`, conditional grants, assertion block. |
| 0007 | `0007_messages_send_permission.sql` | Adds the `messages:send` permission, grants it to owner/admin/manager only (member/viewer keep zero send capability), and asserts owner-has-it / member-lacks-it. | Yes — `ON CONFLICT DO NOTHING` + assertions. |

0006/0007 are hand-written custom SQL registered via
`drizzle-kit generate --custom`, so the journal and snapshots cover all 8
entries. `npm run db:check` (schema ↔ snapshot comparison) passes.

## Rollback policy: forward-only

Migrations are never edited after they have run on a shared branch. A
rollback is a **new forward migration**, not a downgrade:

- **0007** — remove with a forward migration that deletes the
  `role_permissions` rows for `messages:send` (and optionally the
  permission row). Sends become denied by default; already-queued outbox
  rows stay queued and can be cancelled per row.
- **0006** — forward migration that `REVOKE EXECUTE ON FUNCTION
  app.begin_legacy_session(text) FROM workflow_app` and drops the
  function. Legacy sessions stop resolving; Clerk sessions are
  unaffected. The FORCE-RLS assertion has no data effect to undo.
- **0005** — re-`CREATE OR REPLACE` the three functions with the prior
  key literal (only if the pre-fix behaviour is explicitly wanted; it
  denied legitimate owner actions, so prefer staying forward).
- **0004** — forward migration with `ALTER … DROP DEFAULT` per table
  (callers must then always supply ids; not recommended).
- **0003** — seed rows are inert once superseded; leave them. Removing
  roles/permissions in use would break membership resolution.
- **0000–0002** — structural. Do not hand-roll down-migrations. Roll
  back by restoring the Neon **development** branch from its pre-change
  snapshot, or by applying a reviewed forward migration that drops only
  the added objects.

Emergency fallback for any change: Neon branch restore of `development`
to the pre-migration snapshot, then re-run the runner to confirm 8/8.

## Verification after any migration

```bash
node scripts/db-migrate.mjs --dry-run   # expect 8 of 8, 0 pending
npx vitest run tests/tenant-isolation.test.ts tests/outbox-idempotency.test.ts
npm run typecheck && npm test && npm run build
```

## Adding migration 0008+

1. Schema change → edit `src/db/schema.ts`, run
   `npx drizzle-kit generate --name <short_name>`.
2. Hand-written SQL (functions, grants, data fixes) → run
   `npx drizzle-kit generate --custom --name <short_name>`, then paste
   the reviewed SQL into the generated file (keep its journal entry and
   snapshot).
3. Keep every migration idempotent where possible and add an assertion
   block that fails loudly on a wrong end-state (see 0006/0007).
4. Document the new row in the table above in the same commit.
