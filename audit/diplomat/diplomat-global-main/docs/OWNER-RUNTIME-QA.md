# OWNER-RUNTIME QA — AUTHENTICATED ADMIN SESSION (2026-09-18)

**Method:** Real Clerk dev-instance sign-in performed by the Owner in a visible
Playwright Chrome window (no bypass, no guard weakened, no password seen by the
agent). Session saved to `admin-owner.state` (gitignored) for headless reuse.
Dev server on :8080.

## Access verification

- `ADMIN_SESSION_ESTABLISHED=YES` — Owner (`diplomatglobaltechs@gmail.com`,
  `admin_users.role=owner`) signed in; `/dashboard` loads.
- Owner reached `/dashboard/test-data` (route + serverFn authorization intact).

## Admin performance sweep (18 routes, dev server, viewport 1440×900)

Results: `screenshots/admin-perf-live.txt` (raw) — per route:

- **DUPLICATE_REQUESTS=0 on all 18 routes**
- **FAILED_REQUESTS=0 on all 18 routes**
- **POLLING=0** (no repeating requests anywhere in the sweeps)
- DCL (dev-mode compile): dashboard 23.9s cold → 1.6–5.4s warm; all table
  routes warm ≈1.6–3.3s; slowest *resources* are dev-only Vite transforms
  (`@tanstack-start/styles.css?routes=…` 289–1456ms; route modules <340ms) —
  compile-time artifacts, not application queries.
- `overflowX=false` at 1440 and 375 (spot-checked on test-data).
- Long tasks: 0 recorded.
- Verdict: **no N+1, no duplicate hydration, no unbounded request storms at
  runtime.** The earlier source-level fixes hold in the live session.

## `/dashboard/test-data` runtime QA (§21A)

- `TEST_DATA_PAGE_RUNTIME_VERIFIED=YES` (page + dry-run preview exercised)
- `DRY_RUN_UI_VERIFIED=YES` — filters enable the single explicit "Run dry-run
  preview" action; nothing executes without it.
- `REAL_PURGE_EXECUTED=NO` — probe used a non-existent reference
  (`DG-DRYRUN-PROBE-000`); zero records matched, zero deleted.
- Confirmations: execute requires typed phrase + second confirmation
  (test-pinned in `tests/owner-testdata-purge.test.ts`).
- Responsive: no overflow at 375/1280; sidebar collapses to hamburger.

### Findings fixed during QA

1. **FIXED** — React hydration error `<p> cannot contain <div>`
   (`dashboard.test-data.tsx:379`): outer `<p>` → `<div>`. Verified: error no
   longer appears on reload; tsc + eslint + 11/11 purge tests pass.

### Findings requiring Owner action (fail-closed, no data risk)

2. **BLOCKER (environment, not code)** — Dry-run lookup returns
   `permission denied for table review_claims`. Root cause: the earlier
   Supabase REVOKE hardening stripped `service_role` SELECT on
   `review_claims` (the purge preflight counts claims whose only proof is a
   claimed order). Verified live: `orders`, `order_items`,
   `payment_transactions`, `receipts`, `customers`, `admin_notifications`,
   `coupons`, `products`, `audit_logs` all OK for the server key —
   `review_claims` is the only denied table. **Fail-closed worked**: preview
   refused, nothing deleted. Remediation (Owner must apply; no SQL execution
   path exists in this environment by design):

```sql
-- migration: 20260918_regrant_service_role_review_claims_select.sql
-- Purpose: restore service_role SELECT on review_claims only (least privilege),
-- required by the Owner-only test-data purge preflight (dry-run default).
-- Reversal: REVOKE SELECT ON TABLE public.review_claims FROM service_role;
GRANT SELECT ON TABLE public.review_claims TO service_role;
```

3. **MEDIUM (informational)** — Console: CSP blocks
   `https://va.vercel-scripts.com/v1/script.debug.js` (Vercel Analytics dev
   script) because `script-src` doesn't include it. Production uses the
   first-party `/_vercel/insights/script.js` path; decide whether dev CSP
   should allow `https://va.vercel-scripts.com` or leave blocked (analytics
   simply disabled in dev). Owner/security-audit decision; not changed here.

## Honesty notes

- Storage state expires with Clerk dev JWT rotation; if a later headless run
  403s/redirects, redo the one-time headed sign-in and re-run
  `playwright-cli state-save admin-owner.state`.
- Dev-mode timings are not production timings; the sweep proves structural
  properties (no duplicates/polling/failures), not absolute latency.
