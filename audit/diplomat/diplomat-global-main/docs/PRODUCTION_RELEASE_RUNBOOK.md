# PRODUCTION RELEASE RUNBOOK — Diplomat Global

**Status: checklist prepared 2026-09-16. Nothing on this page has been executed against Production. Production deploy and Paystack LIVE remain Owner-gated.**

Branch: `codex/diplomat-final-hardening` · Head at writing: `842ca01`

---

## 1. Hard prerequisites (Owner credentials / external infra)

| Item | Detail | Status |
|---|---|---|
| Clerk Production instance | Create prod instance; new publishable + secret keys (NOT the dev keys currently in Preview). Configure the production domain under allowed origins. | Owner |
| Paystack LIVE keys | Business registered & verified on Paystack. LIVE secret + public keys. Do NOT reuse TEST keys. | Owner |
| Paystack LIVE webhook | Register the LIVE webhook URL pointing at the Production deployment; copy the LIVE signing secret into Vercel env. | Owner |
| Resend sending domain | Add + verify the business domain (SPF + DKIM records); move `RESEND_FROM_EMAIL` to the verified domain; upgrade from the test-key restriction. | Owner (DNS) |
| Brevo production domain | Verify sender/domain, enable auth headers. | Owner |
| SMTP2GO (future fallback) | Deferred until domain setup — not a launch blocker. | Deferred |
| Supabase Production project | Decide: keep the current linked project (it currently serves Preview) or create a dedicated Production project. Note backup limits below. | Owner decision |
| Cloudinary Production config | Current cloud may be reused; ensure strong API secret rotation before launch. | Owner |
| Sentry Production release | Create the Production project/release; wire the Production DSN. | Owner |
| Vercel Production project | Promote the branch to Production AFTER §3 checks; set Production env separately from Preview. | Owner approval required |

## 2. Environment variables to set in Vercel Production (names only — never commit values)

Public (browser-safe, `VITE_`):
- `VITE_SITE_URL` → production domain
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_CLERK_PUBLISHABLE_KEY` → **Production** publishable key
- `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_SENTRY_DSN` (prod DSN)

Server-only (never `VITE_`-prefixed):
- `SUPABASE_SECRET_KEY`, `CLERK_SECRET_KEY` (**Production** secret), `PAYSTACK_SECRET_KEY` (**LIVE**), `PAYSTACK_PUBLIC_KEY` (LIVE)
- `PAYSTACK_WEBHOOK_SECRET` (LIVE signing secret)
- `RESEND_API_KEY` (domain-verified key), `RESEND_FROM_EMAIL`, `CONTACT_OWNER_EMAIL`
- `BREVO_API_KEY` + Brevo sender config
- `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `REVIEW_CLAIMS_HASH_SECRET` → **generate a NEW dedicated secret for Production** (never reuse Preview value; rotating it invalidates un-redeemed claim links)
- Sentry release/auth tokens as required by the Sentry integration

Feature flags:
- `COUPON_RESERVATIONS_V1_ENABLED=true` (currently Preview-only — set explicitly in Production when enabling coupon v2; it is false/absent by default)
- `PAYMENT_FINANCIAL_FINALIZATION_V1_ENABLED=true` (mirror Preview's current value)

## 3. Pre-deploy verification (run after env is set, before opening Production)

1. Full test suite + build + serverFn integrity green on the release commit.
2. Fresh Preview deploy of the release commit is **Ready**.
3. One Paystack **TEST** payment on the release Preview passes the exactly-once probe
   (`scripts/payment-acceptance-probe.mjs <reference>`).
4. Security spot-checks: `rls_auto_enable` EXECUTE restricted; no anon/authenticated
   grants on financial tables (verified 2026-09-16); review_claims FORCED-RLS.
5. Clerk Production domain allowlist includes the production domain (no dev instance).
6. Robots/sitemap/security headers verified against the production build output.

## 4. Backup / recovery reality (Supabase plan limits)

- Supabase **Free plan has no automatic backups/PITR**. Before ANY Production schema
  change: run `supabase db dump` and store the file outside the repo, or upgrade the plan.
- Production DB changes require a deliberate recovery checkpoint (dump → change → verify).
- The three newest migrations (`supabase_grant_hardening`, `review_claims`, plus the
  previously applied payment/coupon set) are already applied to the linked database;
  a NEW Production project would need the full migration chain replayed in order.

## 5. Go-live sequence (each step Owner-gated)

1. Owner sets Production env (§2) in Vercel.
2. Owner approves deploy; the release branch is promoted — **no auto-deploy**.
3. Smoke test on Production: home/shop/PDP render, guest checkout to the Paystack LIVE
   page and **cancel without paying** (no charge), receipt/admin/login flows intact.
4. Register and verify the LIVE webhook (a test event must return 200).
5. First real order: verify exactly-once financials with the read-only probe.
6. Post-launch: Sentry release health, email deliverability (SPF/DKIM passing),
   review-claim emails arriving.

## 6. Rollback

- Vercel: redeploy the previous production deployment (instant rollback).
- Database: restore the §4 checkpoint dump (manual; PITR unavailable on Free).
- Paystack: LIVE keys can be paused in the Paystack dashboard; webhook can be disabled.
- `REVIEW_CLAIMS_HASH_SECRET` rotation invalidates outstanding claim links — only rotate
  in a security incident, then re-issue claims from order data if needed.

## 7. Explicitly NOT done (by instruction)

- Production deploy, Paystack LIVE switch, Clerk dev→Production migration: await Owner.
- Auto-deletion of Cloudinary orphans: census tool is DRY_RUN-only.
