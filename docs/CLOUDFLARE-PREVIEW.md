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

## Blocker: database driver (must be its own task)

`src/db/index.ts` uses `drizzle-orm/node-postgres` + `pg.Pool` (raw TCP).
Workers cannot open TCP sockets, so a Workers deploy needs:

1. `npm i @neondatabase/serverless` (Neon HTTP driver).
2. A `src/db` variant using `drizzle-orm/neon-http` selected by
   `process.env.NEON_HTTP=1` (keep `pg` for local/Node runtimes).
3. `scripts/*` and `tests/*` keep `pg` (they run on Node, unaffected).
4. Re-run: typecheck, full suite against development, `opennext build`,
   hosted security checks against the preview URL.

Until then, the honest preview target is any **Node** host (VPS, Render,
Fly, `next start`) with the Neon development endpoint — where everything
in §Verify already passes.

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
| Cloudflare-hosted URL | ❌ blocked: no account/token here + driver migration pending |

P6 hosted checks (scripts/hosted-security-check.mjs, 11/11) ran against
local servers; re-run the same script with the preview BASE once it
exists (it currently refuses non-localhost targets by design — pass the
preview URL only after replacing seed credentials with throwaway preview
accounts).
