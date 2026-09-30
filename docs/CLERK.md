# Clerk integration — setup and verification

> Status: code-complete, **no keys configured yet**. Development runs on the
> legacy bridge; production without keys refuses all sessions (fail-closed,
> verified: prod `/login` renders "Sign-in unavailable", `/dashboard` 307s).
> Do not delete the legacy bridge until the checklist below passes with real
> keys. Never commit keys — `.env.local` only (already git-ignored).

## 1. Create a Clerk development instance

1. In the Clerk dashboard create an application (development instance).
2. Copy **Publishable key** (`pk_test_…`) and **Secret key** (`sk_test_…`).
3. Allowed origins / redirect URLs: add `http://localhost:3111` and, later,
   the Cloudflare preview URL. Sign-in URL `/login`, sign-up URL `/signup`.

## 2. Configure the app (development machine only)

```bash
# .env.local — never commit
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
CLERK_SECRET_KEY=sk_test_…
CLERK_AUTHORIZED_PARTIES=http://localhost:3111
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
# PLATFORM_ADMIN_CLERK_USER_ID=<your Clerk user id, for the one-time
# platform-admin bootstrap only>
```

Restart `next dev`. `authMode()` switches `legacy` → `clerk`
automatically when both keys are present; nothing else changes.

## 3. Verification checklist (run with test keys)

- [ ] **Sign up**: `/signup` renders Clerk `<SignUp routing="hash"/>`,
      creates a Clerk user and a local profile row via
      `app.upsert_local_user`.
- [ ] **Sign in**: `/login` renders `<SignIn routing="hash"/>`; session
      lands on `/dashboard`.
- [ ] **Sign out**: logout action revokes the Clerk session
      (`signOutCurrentIdentity`) and clears local cookies.
- [ ] **Dashboard redirect**: signed-out `/dashboard` → `/login`;
      signed-in user with no orgs → `/onboarding`.
- [ ] **Organization resolution**: dashboard lists exactly the orgs from
      `app.user_organizations()` (DB-verified, never cookie-asserted).
- [ ] **Workspace switching**: org cookie preference honoured only when it
      matches a resolved membership (`getCurrentOrg`).
- [ ] **Revoked membership denial**: `status='revoked'` → tenant context
      raises 42501 immediately (covered DB-level by tenant-isolation).
- [ ] **Cross-tenant denial**: forged org id → 42501 (covered DB-level).
- [ ] **Role/permission enforcement**: `messages:send` required before any
      enqueue; member fixtures hold only `contacts:write` + `imports:write`
      (covered DB-level; 0007 asserts owner-has / member-lacks).

## 4. Production rules

- Production **without** `CLERK_SECRET_KEY` stays `unconfigured`: every
  request unauthenticated, no password fallback exists in that mode.
- The legacy bridge (`legacyAuthAllowed()`) is reachable only when
  `NODE_ENV !== "production"` **and** Clerk is absent.
- Remove the bridge only after this checklist passes end-to-end with real
  keys *and* all pre-Clerk accounts have linked Clerk subjects
  (`users.clerk_user_id` backfilled via `app.upsert_local_user`).

## 5. How it is wired (for reviewers)

- `src/proxy.ts` mounts `clerkMiddleware()` only when keys exist.
- `src/lib/auth.ts` resolves the verified subject via `auth()`, provisions
  the local row, reads platform-admin status from `platform_admins`
  (never from client-writable metadata).
- `src/lib/tenant.ts` accepts only `{ kind: "clerk", clerkUserId }` or a
  DB-verified legacy token; every customer read goes through
  `withTenant()` → `SET LOCAL ROLE workflow_app` (no BYPASSRLS).
