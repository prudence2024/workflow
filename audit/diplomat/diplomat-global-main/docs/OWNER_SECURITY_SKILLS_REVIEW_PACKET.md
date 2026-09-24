# OWNER SECURITY-SKILLS REVIEW PACKET — Diplomat Global

**Purpose:** briefing for the Owner's personal desktop security skills
(security-review / security-scan / security-bounty-hunter / gateguard, Postgres,
API/serverFn, upload-file, deployment audits). Audit the ACTUAL CODE, not prior agent reports.

## Scope

- Repo: https://github.com/prudence2024/diplomat-global
- Branch: `codex/diplomat-final-hardening`
- Baseline `efaf212` → review HEAD (currently `806643b`); `git diff efaf212..HEAD --stat`
- Security-relevant addendum items: hero static-destination scheme allowlist
  (`sanitizeStaticHeroLink` — javascript:/data: can never reach carousel CTAs);
  live concurrency test script is hard-gated behind `FINAL_UNIT_LIVE_TEST=1` and
  fully self-cleaning (verify it stays that way); source pickers expose only
  status-filtered public records via `hero.manage` permission.
- Also allowed: full-repo audit (not diff-limited) — the skills are the final security gate before production.

## Architecture boundaries (audit against THIS stack)

TanStack Start + React (Vercel) · Supabase Postgres (shared Preview+Production DB) ·
guest checkout, NO customer auth · Clerk admin-only · Paystack · Resend/Brevo ·
Cloudinary · Upstash rate limits · Sentry.

## Priority audit targets

1. **AuthN/AuthZ:** every privileged serverFn in `src/lib/admin/server-fns.ts` —
   verify each calls `requireAdmin`/`requireOwner` server-side; route guards in
   `src/routes/dashboard*.tsx` are UX only. Owner-only purge:
   `src/lib/admin/testdata-purge.server.ts` (both preview and execute paths).
   IDOR: object-level checks on order/receipt/customer/blog/page detail serverFns.
2. **Secrets/boundary:** service_role only in server modules; nothing sensitive in
   `VITE_*`; client-reachable `server-fns.ts` never statically imports server-only
   modules (dynamic `import()` pattern — build import-protection enforces); Telegram bot
   token never client-side or logged.
3. **SQL/DB:** RLS on all 32 tables; no anon/authenticated grants (REVOKE hardening);
   FORCE RLS on review_claims + coupon_reservations; RPC security definer search_path
   hardening; purge delete set bounded by explicit ID selection only.
4. **Uploads:** Cloudinary-only uploads — server-validated size (5MB)/dimensions
   (4000px)/format allowlist; SVG rejected; browser MIME/filename never trusted; safe
   generated public_ids.
5. **Input handling:** zod schemas on all serverFns; structured-content renderers
   (`safe-text-links.ts`, `legal-page.tsx`, `safe-paragraph.tsx`) allow only https/mailto;
   no `javascript:`/`data:` anywhere.
6. **Payments:** webhook signature verification (`api/webhook.paystack.ts`); callback
   authority rules; no amount computed client-side; rate limiting never breaks webhook
   retries.
7. **Rate limits:** public mutations (contact, newsletter, reviews, claims, checkout
   init, admin-mutation) use Upstash server-side limits — verify coverage and failure UX.
8. **Headers/CSP:** iframe embed (`google_maps_embed_url` allowlist), CSP frame-src,
   referrerPolicy on map iframes.
9. **Supply chain:** dependency surface, service worker financial bypass scope
   (`public/` SW must never serve payment/checkout routes).

## Environment state (context)

- Paystack TEST only; Clerk development keys; Production deploy forbidden this phase.
- Known external pending: email domain SPF/DKIM/DMARC, Brevo sender verification,
  Clerk Production, Paystack LIVE — audit code handling, not the missing infrastructure.

## Report format

Per finding: SEVERITY (CRITICAL/HIGH/MEDIUM/LOW), FILE, EVIDENCE (code path/line),
EXPLOIT, FIX, TEST. Separate PROVEN from THEORETICAL. End with: CRITICAL count,
HIGH count, top-5 remediation order.
