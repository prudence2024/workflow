# Cloudflare preview — preparation status and path

> Status: **scaffolded, not deployed.** `wrangler.jsonc` exists with
> development-only vars and placeholder URL. No Cloudflare account, API
> token, or deployed worker exists in this environment, so P5 verification
> below was executed against the equivalent local production server
> (`next start`) plus the honest gap list. Do not touch production.

## What is ready today

- `next build` passes with no runtime secrets (lazy DB pool, Clerk
  middleware mounted only with keys).
- `wrangler.jsonc`: preview name, `nodejs_compat`, observability on,
  dev-only `vars`. All secrets documented as `wrangler secret put` items,
  never in the file.
- `src/proxy.ts` is edge-safe by construction (no Node APIs; Clerk import
  is dynamic and key-gated).
- `next.config.ts` already disables the image optimizer and externalises
  `pg`/`bcryptjs`/`cheerio`/`xlsx` for a Workers-style bundle.

## Database driver: DONE (Neon WebSocket transport)

`src/db/index.ts` now selects the transport by `DATABASE_RUNTIME`
(`wrangler.jsonc` sets `edge`; Node runtimes default to `node`):

- `node`: `pg` Pool over TCP — dev, scripts, migrations, tests. Unchanged.
- `edge`: `@neondatabase/serverless` Pool over WebSocket +
  `drizzle-orm/neon-serverless`, which supports real interactive
  transactions. `withTenant()` is untouched: BEGIN → verified identity →
  `set_tenant_context` → `SET LOCAL ROLE workflow_app` → queries →
  COMMIT runs identically, so forced RLS, the restricted role and
  membership checks hold on Workers.
- One deliberate normalization: the WS driver wraps PG failures as
  `{ query, params, cause }`, so the edge client lifts `cause.code` onto
  the outer error — both transports expose the same SQLSTATE to callers.

Verified by `tests/edge-driver.test.ts` (runs with
`DATABASE_RUNTIME=edge` against the development branch): restricted role,
own-row reads, cross-tenant invisibility, forged-org 42501, rollback —
5/5. Connection note: each WebSocket is one Postgres connection; the
pool stays small (`DATABASE_POOL_MAX`, default 5). Fine for staging;
production scale-up means Cloudflare Hyperdrive, a separate task.

## Deploy commands (when credentials + driver are ready)

```bash
npm i -D @opennextjs/cloudflare   # one-time scaffold
npx opennextjs-cloudflare build   # produces .open-next/
npx opennextjs-cloudflare preview # local Workers runtime check
# secrets first (development + TEST keys only):
wrangler secret put DATABASE_URL
wrangler secret put DATABASE_URL_UNPOOLED
wrangler secret put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
wrangler secret put CLERK_SECRET_KEY
# ... WORKER_SECRET, RESEND_*, TERMII_*, TELEGRAM_*, R2_* (test only)
npx opennextjs-cloudflare deploy  # preview environment, never production
```

## Verify list (P5) — status

| Check | Status |
|---|---|
| build | ✅ `npm run build` exit 0 |
| login | ✅ dev: real form login → `/dashboard`; prod-mode: keyless `/login` renders "Sign-in unavailable" (fail-closed) |
| dashboard / records / imports / campaigns / communications / form operations | ✅ dev walk: all 200, console clean |
| exports | ✅ routes resolve identity via `getCurrentUser`; covered in walk (exports are action-driven, no console errors) |
| webhook routes | ✅ unsigned/forged rejected 401; signed accepted; replay deduped |
| worker routes | ✅ no secret → 401; honest tally with secret (code + idempotency suite) |
| Worker bundle (`opennextjs-cloudflare build`) | ✅ exit 0, `.open-next/worker.js` produced (local Windows needs no symlink privilege: junctions used by the local-only build-tool patch, never committed) |
| Local workerd preview | ✅ boots with edge vars bound; `/api/health`, `/`, `/pricing`, `/login`, `/signup`, `/product` all 200; `/login` fail-closed without Clerk keys |
| Cloudflare-hosted URL | ❌ blocked: needs dashboard secrets (dev Neon URL, Clerk test keys) + someone with account access to read the Preview build result |

P6 hosted checks (scripts/hosted-security-check.mjs, 11/11) ran against
local servers; re-run the same script with the preview BASE once it
exists (it currently refuses non-localhost targets by design — pass the
preview URL only after replacing seed credentials with throwaway preview
accounts).
