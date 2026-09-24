# CODEX REVIEW PACKET — Diplomat Global final-hardening review

**Purpose:** independent review of the ACTUAL CODE/DIFF (not any agent's summary).
Reviewer: Codex (or any second agent). Do not trust prior agent conclusions; verify from source.

## Identify the diff

- Repo: https://github.com/prudence2024/diplomat-global
- Branch: `codex/diplomat-final-hardening`
- Baseline SHA (before this hardening arc): `efaf212`
- Current SHA at packet creation: `806643b` (UPDATE: review HEAD — packet refreshed after Owner addendum: hero binding, final-unit proof, skill fixes)
- Diff command: `git diff efaf212..HEAD --stat` then review per-file.
- Key areas in the diff (commit list): `git log --oneline efaf212..HEAD`
- Gate status at `c2cb023`: vitest 743/743 (0 skipped), tsc clean, eslint no new findings on run-authored files, build pass, serverFn integrity 556 refs / 0 missing, `git diff --check` clean.
- NEW since `6445cbf` (Owner addendum arc):
  - `src/lib/hero-source.ts` + `src/lib/admin/server-fns.ts` `getPublicHeroSlides` — hero slides whose `cta_link` targets `/products/$slug` or `/blog/$slug` are SOURCE-BOUND: content derived live per public read, missing/unpublished sources OMITTED (no dead CTAs), failed source fetch falls back to stored snapshot, static destinations scheme-allowlisted. `adminHeroProductOptions`/`adminHeroBlogOptions` power the Admin source pickers; `dashboard.hero-slides.tsx` validates on save.
  - `scripts/final-unit-concurrency.live.ts` — LIVE concurrent execution of `complete_verified_payment_v2` for competing paid checkouts (guarded by `FINAL_UNIT_LIVE_TEST=1`, self-cleaning): stock=1 A/B → exactly one completion; 3+3 → one; 4+1 → both; 2+2+2 → two; ZERO oversell, ZERO paid-without-completion. Proven gap: nothing reserves stock before provider payment, so both Paystack charges can succeed and the loser requires a manual refund — see `docs/INVENTORY-RESERVATION-PROPOSAL.md` (Owner decision, NOT implemented).
  - `src/components/hero-carousel.tsx` — pause control + prefers-reduced-motion (WCAG 2.2.2), truthful per-source-kind badges, focus rings; `src/routes/shop.tsx` labelled price sliders; `src/components/ui/phone-input.tsx` accessible name fallback.
  - Verified live (playwright): 4 hero slides w/ correct CTAs → working PDP/blog pages; axe-name spot checks (0 unnamed buttons/controls after fixes); no horizontal overflow at 375/1280/1440; zero `setInterval` polling in dashboard components.
- NEW since `cdf72a6` (highest review value): `src/lib/admin/testdata-purge.server.ts` + `src/routes/dashboard.test-data.tsx` (Owner-only destructive purge — dry-run default, typed double confirm, rate-limited, FK-ordered deletes, `externallyLinked` customer guard); `src/lib/inventory-settings.server.ts` (sold-out transition notification + Telegram, product-scoped event-key dedup, source-truthful sale-vs-manual); `src/components/offline-support.tsx` (stale-focus/reconnect `router.invalidate()` revalidation); `src/lib/admin/server-fns.ts` `adminDeleteCategory` populated-category guard; `src/routes/index.tsx` truthful Best Sellers vs Featured picks; `docs/CRITICISM-FINDINGS.md` (second-agent shortcut: read this first).

## Areas to inspect (highest risk first)

1. **Payments / financial atomicity**
   - `src/lib/payment-finalize.server.ts` (finalize paths, `runPostCompletionEffects`,
     new review-claim issuance block — must be failure-tolerant, idempotent, never
     before payment authority)
   - `src/lib/payment-finalizer-selector.server.ts`, coupon reservation/release flow
   - `supabase/migrations/20260914120100_payment_finalization_v2.sql` (v2 RPC; v1 must
     remain byte-identical — verify with `git log -p` on the v1 file)
   - Invariants: exactly-once financial completion (PK order_id fence), inventory
     exactly-once, coupon exactly-once, receipt exactly-once, no blind retries,
     network failure ≠ decline, refund lifecycle never marks money moved on its own.

2. **Review claims (NEW — Owner-approved design)**
   - `supabase/migrations/20260916130000_review_claims.sql` — atomic
     `redeem_review_claim_v1`: FOR UPDATE claim lock, authoritative paid-order recheck,
     order_items fence, duplicate-review policy, review insert + claim consumption in
     ONE transaction, verified_purchase set server-side only, no badge-reversal path.
   - `src/lib/review-claims.server.ts` — 32-byte base64url token, HMAC-SHA256 with
     dedicated `REVIEW_CLAIMS_HASH_SECRET` (must NOT reuse provider keys), idempotent
     issuance (unique order+product; live claim reused, never duplicated), raw token
     only in the purchaser email.
   - `src/routes/reviews.tsx` — claim redemption UI; typed email must be contact-only.
   - Attack surfaces to probe: token replay, concurrent redemption, expired/revoked
     paths, forwarded-link capability model (documented, not hidden), enumeration.

3. **Security hardening**
   - `supabase/migrations/20260916120000_supabase_grant_hardening.sql` — verify service
     access preserved, browser roles revoked, default-privilege drift closed,
     `rls_auto_enable()` EXECUTE removed from PUBLIC/anon/authenticated.

4. **Receipt/email canonical architecture**
   - `src/lib/email-templates.server.ts` (one canonical receipt email for automatic +
     Admin resend), `src/lib/receipt-pdf.ts` (single PDF renderer for download +
     attachment), `src/lib/admin/server-fns.ts` Admin resend path (attachment + auth),
     `customerDisplayName` (order.shipping_address.full_name primary).

5. **Storefront/a11y**
   - `src/styles.css` brand token change (light `--brand: oklch(0.5 0.13 220)`, dark
     `0.78 0.12`), footer opacity bumps, `site-header.tsx` link-name fix,
     `hero-carousel.tsx` aria-hidden removal — check for visual regressions in dark
     mode and any component relying on the old bright brand for text.

6. **Tooling**
   - `scripts/cloudinary-orphan-census.mjs` — must remain deletion-free (DRY_RUN
     hard-coded), no secret printing, correct public_id extraction.

7. **Client/server boundary**
   - `src/lib/checkout.server.ts` inlined v1 gate (must stay byte-equal to
     `payment-rollout.server.ts` semantics; see `tests/checkout-import-boundary.test.ts`).

## Known invariants (verify, do not assume)

- `complete_verified_payment_v1` byte-identical since its last approval.
- No anon/authenticated grants on any `public` table; RLS enabled on all 32 tables;
  review_claims + coupon_reservations FORCE RLS.
- No customer-facing auth anywhere (guest checkout only; Clerk = admin only).
- No polling loops; no automatic non-idempotent write replay; payment stays fail-closed
  offline.
- Service-role credentials never in `VITE_*`, never in client bundles
  (`.output/public` is clean as of `cdf72a6`).

## Known Owner requirements (review against these)

- Verified Purchase: guest claim tokens ONLY (no accounts, no Clerk/Supabase auth for
  customers); typed email never influences verification; 30-day expiry; full refund
  before review blocks redemption; full refund after review KEEPS review + badge.
- One canonical receipt representation (View/Print, PDF, email, Admin resend).
- No new frameworks: no Convex/tRPC/Prisma/Firebase, no animation/carousel libs.

## Report format

For each finding: SEVERITY (BLOCKER/HIGH/MEDIUM/LOW/NIT), FILE, FUNCTION, ROOT_CAUSE,
EXPLOIT_SCENARIO, BLAST_RADIUS, EXACT_FIX, TEST_ADDED (or why none). Verify claims by
running the code/tests — the repo's suites are `npx vitest run`, `npx tsc --noEmit`,
`npm run build`, `npm run verify:serverfn`.
