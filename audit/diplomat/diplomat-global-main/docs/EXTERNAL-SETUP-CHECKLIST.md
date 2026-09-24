# EXTERNAL SETUP CHECKLIST — OWNER ACTIONS ONLY (PREPARED, NOT EXECUTED)

**Status:** Prepared checklist. **No step below was configured during this run.**
Every item requires Owner credentials/access. App code is ready for each item
marked `APP_CODE_ALREADY_READY=YES`.

---

## 1. TRANSACTIONAL EMAIL — RESEND PRODUCTION DOMAIN

- **SERVICE=** Resend (receipts, order emails)
- **CURRENT_STATE=** Code sends via Resend API with verified-sender resolution and truthful failure when no valid sender exists. Test-sender mode only until a domain is verified.
- **WHAT_OWNER_MUST_CONFIGURE=** Add the production sending domain in Resend → Domains; create DNS records at the domain's DNS host; verify in Resend; then set `RESEND_FROM_EMAIL` (e.g. `receipts@<domain>`) in Vercel env.
- **WHERE=** resend.com/domains → DNS host of the production domain → Vercel → Project → Settings → Environment Variables.
- **WHAT_VALUE/RECORD_TYPE_IS_REQUIRED=** Resend supplies exact values: typically `MX` (feedback-smtp.<region>.amazonses.com, priority 10), `TXT` SPF (`v=spf1 include:amazonses.com ~all`), plus DKIM `TXT` records (resend._domainkey…). Copy values verbatim from the Resend dashboard.
- **HOW_TO_VERIFY=** Resend dashboard shows domain `Verified`; send one test receipt from Preview; confirm inbox delivery (not spam) and correct From header.
- **SAFE_ROLLBACK=** Revert `RESEND_FROM_EMAIL` to the previous verified test sender; DNS records can be deleted with no app-code change.
- **APP_CODE_ALREADY_READY=YES**

## 2. MARKETING EMAIL — BREVO PRODUCTION DOMAIN

- **SERVICE=** Brevo (marketing/newsletter)
- **CURRENT_STATE=** Code resolves a verified active sender and fails truthfully when none exists; unverified fallback removed.
- **WHAT_OWNER_MUST_CONFIGURE=** Brevo → Senders & IP → Domains: add production domain, add the DKIM/DMARC Brevo records at DNS host, verify, then set the from-address in Brevo template/config.
- **WHERE=** app.brevo.com → Senders, Domains & Dedicated IPs; DNS host of production domain.
- **WHAT_VALUE/RECORD_TYPE_IS_REQUIRED=** Brevo-provided DKIM `TXT` + `DMARC` TXT records (values shown in the Brevo UI — copy verbatim).
- **HOW_TO_VERIFY=** Brevo shows domain authenticated; a marketing test send lands in inbox with correct sender.
- **SAFE_ROLLBACK=** Remove domain in Brevo; app code already reports truthful configuration failure rather than fake success.
- **APP_CODE_ALREADY_READY=YES**

## 3. SPF / DKIM / DMARC POLICY RECORDS

- **SERVICE=** Domain DNS (protects both Resend + Brevo deliverability)
- **CURRENT_STATE=** Not configured (no domain access this run).
- **WHAT_OWNER_MUST_CONFIGURE=** After Resend + Brevo records exist: consolidate SPF `TXT` (`v=spf1 include:amazonses.com include:spf.sendinblue.com ~all` — merge only if both providers confirmed), keep provider DKIM records, add `DMARC` TXT `_dmarc` starting at `v=DMARC1; p=none; rua=mailto:<owner@domain>`.
- **WHERE=** DNS host of the production domain.
- **WHAT_VALUE/RECORD_TYPE_IS_REQUIRED=** `TXT` records above (values from providers; never invent).
- **HOW_TO_VERIFY=** Use a DMARC/SPF checker (e.g. MXToolbox) for the domain: SPF pass, DKIM pass, DMARC published.
- **SAFE_ROLLBACK=** Lower/remove DMARC record; SPF revert to single-provider include.
- **APP_CODE_ALREADY_READY=YES**

## 4. SMTP2GO FALLBACK (DEFERRED BY DESIGN)

- **SERVICE=** SMTP2GO (transactional fallback)
- **CURRENT_STATE=** Explicitly deferred until domain/provider setup per architecture decision.
- **WHAT_OWNER_MUST_CONFIGURE=** Only if fallback is wanted later: SMTP2GO account, sender-domain verification (SPF/DKIM records from their UI), SMTP credentials into Vercel env.
- **WHERE=** smtp2go.com → Settings → Sender Domains; Vercel env.
- **WHAT_VALUE/RECORD_TYPE_IS_REQUIRED=** SMTP2GO-provided DKIM/SPF TXT records + SMTP username/password env values.
- **HOW_TO_VERIFY=** SMTP2GO dashboard test send succeeds; app-level forced-failure drill sends via fallback.
- **SAFE_ROLLBACK=** Remove env vars; primary Resend path is untouched.
- **APP_CODE_ALREADY_READY=YES (deferred by design, not a gap)**

## 5. CLERK PRODUCTION

- **SERVICE=** Clerk (Admin auth only — customers remain guest-checkout, no customer Clerk accounts)
- **CURRENT_STATE=** Development keys + dev instance in use. No Production keys switched.
- **WHAT_OWNER_MUST_CONFIGURE=** Create/select the Clerk Production instance; add production domain; create Production Admin user(s); set `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` (prod values) in Vercel; update webhook signing secret if the Clerk webhook is used.
- **WHERE=** dashboard.clerk.com → Production instance; Vercel env.
- **WHAT_VALUE/RECORD_TYPE_IS_REQUIRED=** `pk_live_…` / `sk_live_…` keys; production domain allowlist; webhook `whsec_…` if applicable.
- **HOW_TO_VERIFY=** Sign in to Admin on the production domain with the Owner account; a non-Owner Admin role cannot reach `/dashboard/test-data`; Telegram/notifications still fire.
- **SAFE_ROLLBACK=** Revert Vercel env to dev keys and redeploy.
- **APP_CODE_ALREADY_READY=YES** (Owner-only purge authorization is enforced server-side on both preview and execute)

## 6. PAYSTACK LIVE

- **SERVICE=** Paystack (payments)
- **CURRENT_STATE=** TEST mode only. Finalization v2 RPC + receipt/email paths proven by live DB concurrency tests; no LIVE transaction attempted.
- **WHAT_OWNER_MUST_CONFIGURE=** Complete Paystack business activation for LIVE keys; set `PAYSTACK_SECRET_KEY` (sk_live) + public key in Vercel; register the LIVE webhook URL in the Paystack dashboard; run one small real LIVE transaction as final acceptance.
- **WHERE=** dashboard.paystack.com → Settings → API Keys & Webhooks; Vercel env.
- **WHAT_VALUE/RECORD_TYPE_IS_REQUIRED=** `sk_live_…` key; webhook URL `https://<production-domain>/api/paystack/webhook` (exact route per repo).
- **HOW_TO_VERIFY=** Paystack dashboard shows LIVE webhook enabled + recent deliveries 2xx; one real small purchase produces order + receipt email + correct stock decrement.
- **SAFE_ROLLBACK=** Revert env to `sk_test_…` and redeploy; no schema/code rollback needed.
- **APP_CODE_ALREADY_READY=YES**

---

## SUMMARY

- **EMAIL_DOMAIN_SETUP_CHECKLIST_READY=YES** (items 1–4)
- **CLERK_PRODUCTION_CHECKLIST_READY=YES** (item 5)
- **PAYSTACK_LIVE_CHECKLIST_READY=YES** (item 6)
- **EXECUTED_DURING_THIS_RUN=NONE** — every step is an Owner credential action.
