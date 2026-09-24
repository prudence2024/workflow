# DEEPSEEK REVIEW PACKET — Diplomat Global independent review

**Purpose:** independent review of the ACTUAL CODE/DIFF (not any agent's summary).
Reviewer: DeepSeek (or any second agent). Do not trust prior agent conclusions; verify from source.

## Identify the diff

- Repo: https://github.com/prudence2024/diplomat-global
- Branch: `codex/diplomat-final-hardening`
- Baseline SHA (before hardening arc): `efaf212`
- Review target: HEAD (currently `806643b`)
- Addendum evidence first: `scripts/final-unit-concurrency.live.ts` (live concurrent
  v2-finalization proof: no oversell, but both provider charges possible → manual
  refund for the loser; reservation proposal in `docs/INVENTORY-RESERVATION-PROPOSAL.md`)
  and `src/lib/hero-source.ts` (hero source binding: live derivation, omit-on-invalid,
  snapshot-on-fetch-failure — 13 tests in `tests/hero-source.test.ts`).
- Diff command: `git diff efaf212..HEAD --stat`, then review per-file; `git log --oneline efaf212..HEAD`
- First read: `docs/CRITICISM-FINDINGS.md` (self-criticism pass with live-probe evidence; verify its SAFE-BY-DESIGN claims, do not accept them)

## Architecture (hard constraints — findings that assume otherwise are invalid)

TanStack Start + React · Supabase PostgreSQL · guest checkout only (no customer
accounts anywhere) · Clerk = admin-only auth · Paystack · Resend transactional /
Brevo marketing · Cloudinary · Upstash rate limiting · Vercel · Sentry.
NO Convex/tRPC/Prisma/Firebase/Next.js middleware.

## Areas to inspect (highest risk first)

1. Payments/financial atomicity: `src/lib/payment-finalize.server.ts`,
   `payment-finalizer-selector.server.ts`, `supabase/migrations/20260914120100_payment_finalization_v2.sql`.
   Invariants: exactly-once financial completion/inventory/coupon/receipt; callback+webhook
   replay never double-decrements stock or duplicates notifications; network error ≠ decline.
2. Owner-only test-data purge: `src/lib/admin/testdata-purge.server.ts`,
   `src/routes/dashboard.test-data.tsx`. Verify: server-side Owner authorization on BOTH
   preview and execute; dry-run default; FK-safe delete ordering; `externallyLinked`
   customer guard; rate limiting; typed double confirmation; no catalog/CMS deletion.
3. Sold-out transitions: `src/lib/inventory-settings.server.ts`, `src/lib/notifications.ts`,
   `src/lib/payment-finalize.server.ts` — exactly-once notification + Telegram alert on
   `>0 → ≤0`, source-truthful (sale vs manual), deduped by product-scoped event key.
4. Stale carts / checkout authority: `src/lib/checkout-quote.ts`, `src/lib/checkout.server.ts`
   — persisted browser cart is NEVER authority; Paystack init revalidates existence/stock/
   price/coupon/delivery/total server-side.
5. Client/server boundary: no service_role in client bundles; `server-fns.ts` uses dynamic
   `import()` for server-only modules (import-protection enforced at build).
6. Review claims: `src/lib/review-claims.server.ts`, `supabase/migrations/20260916130000_review_claims.sql`.
7. Public resilience: `src/components/offline-support.tsx` (stale-focus/reconnect
   revalidation), `src/lib/public-resilience.ts` (LKG) — verify no polling, no reconnect storm.

## Known invariants (verify, do not assume)

- `complete_verified_payment_v1` byte-identical since last approval.
- No anon/authenticated grants on any public table; RLS on all 32 tables;
  review_claims + coupon_reservations FORCE RLS.
- `git diff --check` clean; vitest 756/756 (0 skipped); tsc clean; serverFn integrity
  556/0 at HEAD.

## Report format

For each finding: SEVERITY (BLOCKER/HIGH/MEDIUM/LOW/NIT), FILE, FUNCTION, ROOT_CAUSE,
EXPLOIT_SCENARIO, BLAST_RADIUS, EXACT_FIX, TEST_ADDED (or why none). Verify claims by
running `npx vitest run`, `npx tsc --noEmit`, `npm run build`. Distinguish PROVEN ISSUE
vs LIKELY RISK vs SAFE-BY-DESIGN vs OWNER BUSINESS DECISION.
