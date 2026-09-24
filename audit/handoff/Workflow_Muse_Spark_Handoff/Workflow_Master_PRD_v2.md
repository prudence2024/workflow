# Workflow — Master Product Requirements Document

**Version:** 2.0 · **Date:** 23 September 2026 · **Status:** Build specification for Muse Spark / engineering review  
**Brand:** Workflow (working commercial name; domain/trademark clearance outstanding)  
**Primary proposition:** **All your operations. In flow.**  
**Supporting brand line:** **Connect · Automate · Move Forward**  
**Product description:** Manage records, automate processes, communicate through bulk email and SMS, organize campaigns, schedule reminders and report on operations—all in one multi-tenant workspace.  
**Feature line for the form module:** **From forms to follow-up.**

> **Builder mandate:** Reuse the uploaded existing application where safe. This is an operational business SaaS, **not** just a bulk-form submission website or a pretty landing page. Do not claim simulated functions are live.

---

## 1. Mission and product scope

Workflow gives small and growing organizations one place to manage records, contacts, campaigns, external/hosted forms, internal tasks, multi-channel communication, automated follow-ups, reporting and team operations. The persistent **record/contact** is the center of the system: one contact can participate in many campaigns and retain a chronological history of imported data, forms, messages, reminders and outcomes. Form submission is an important module, **not the entire brand**.

**Primary customers:** businesses, agencies, schools, community organizations, event organizers, associations, NGOs, training providers and service teams. **Product principles:** tenant isolation, practical usability, traceable outcomes, consent-based communication, controlled costs, mobile accessibility, honest statuses and modular extensibility.

### Primary jobs to be done

- Import and clean Excel/CSV datasets without losing important details.
- Maintain searchable records with tags, custom fields, notes and campaign histories.
- Prepare and send personalized transactional email, permission-based bulk email and bulk SMS.
- Create, schedule, pause and inspect reminders, follow-up tasks and reports.
- Automate *authorized* form submission with mapping, validation, queued workers and per-record result tracking.
- Invite team members with appropriate workspace permissions.
- Understand what happened to each person and every campaign; export evidence and reports.

### Product boundaries

- No arbitrary public-portal automation or CAPTCHA/OTP/anti-bot circumvention.
- **Agency-only** for public-sector portals: the customer organization must itself be the responsible institution/operator and administer or own the destination.
- No bulk promotional outreach without appropriate consent; support unsubscribe/opt-out and suppression.
- Do not advertise simulated submissions or emails as successful real-world operations.

---

## 2. Approved brand and visual identity

**Use the user-approved uploaded Workflow identity board as the canonical visual reference.** It shows an interwoven, ribbon-like blue/cyan/teal **W** symbol, a dark navy `Workflow` wordmark, generous white space, a deep navy application icon and matching light/dark variants. Treat the supplied artwork as the source of truth, not a prompt to generate unrelated W logos.

**Reference colors from the approved brand board:**

| Token | Hex | Use |
|---|---|---|
| Midnight navy | `#0B1F3B` | Primary wordmark, dark headers, dark hero blocks |
| Electric blue | `#3B82F6` | Primary product actions, one section of icon |
| Teal | `#14B8A6` | Secondary icon ribbon, sparing accent and positive highlights |
| Pure white | `#FFFFFF` | Light backgrounds and reversed wordmark |

Add accessible functional tokens for neutral surfaces, gray text, borders and feedback states; do not incorrectly use brand teal as every success/warning/error color. Verify actual text contrast and hover/focus states. Default product canvas: luminous white/off-white with disciplined midnight typography. Dark surfaces should feel premium rather than neon. Avoid excessive glass, stock-office photography, purple AI gradients, generic illustrations and uniformly rounded card grids.

**Typography—critical requirement:** The exact typeface used in the supplied **rasterized logo image cannot be verified from the image alone**. If the designer has an editable logo or specifies the original font, use that exact typeface/outlined wordmark as the primary brand asset and obtain an appropriate webfont license before using it site-wide. **Do not claim a guessed font is the official logo font.** Until the original font is confirmed, use **Manrope** (600–800 for headings, 400–600 for UI) as a close visual starting point; manually compare against the approved wordmark at several sizes. If only the raster/logo image is available, use the actual supplied wordmark image in brand placements, not newly typed approximate lettering. The UI may use Manrope as a harmonious companion, pending approval. Do not bundle or redistribute unlicensed font files.

**Brand assets required:** (a) horizontal logo on light; (b) horizontal reversed logo on midnight; (c) standalone W symbol on transparent background; (d) monochrome black/white symbol; (e) rounded-square navy app icon; (f) favicon exports at 16, 32 and 48 px and app-icon PNGs at 192 and 512 px; (g) header/email-safe asset versions; (h) source vector SVG produced or validated by a designer. Supplied isolated PNG assets are references, not proof of vector fidelity; compare them against the approved board before shipping. No invented registered mark; keep ™ out of interface assets until brand/legal review.

**Design benchmark:** custom art-directed premium B2B SaaS, visually comparable in care to a professionally commissioned five-figure website. Evaluate both a high-end marketing site and a highly usable dashboard; beauty may not compromise legibility, performance or keyboard access. Target WCAG 2.2 AA where applicable, mobile responsive layouts and reduced-motion support.

---

## 3. Reuse the existing application—do not start from zero

The supplied ZIP `form-workflow-automation-platform (2).zip` is **an existing Next.js 16 + React 19 + TypeScript + Drizzle/Postgres codebase** with public pages, dashboard, contacts, campaigns, basic XLSX/CSV processing, custom sessions, HTML-only form analysis, simulated submission outcomes, a basic Resend function and local upload storage. These features are **not all production ready**.

The previous design discussion proposed TanStack Start and Supabase Auth; however, the actual uploaded application is already Next.js. **Current recommended implementation baseline** (subject to a preliminary source audit): **retain Next.js App Router and Drizzle** rather than paying for an unnecessary full framework rewrite. Adopt Clerk + Neon if the founder approves this revised stack. If preserving TanStack Start is more important than code reuse, surface that decision explicitly before implementing. Do not mix multiple live auth systems or copy database RLS policies from an earlier Supabase-specific spike without adaptation.

**Migration checklist before feature work:** make a Git snapshot/branch, inventory routes/tables/credentials, identify real vs demo UI, replace custom auth safely, map existing identities and organization IDs, add a compatibility migration, run tenant-isolation tests, replace file storage, move long-running operations out of web requests, and remove misleading simulated success states. Preserve current UI and business logic when tests show they are usable. Never delete customer data or run irreversible migrations without a verified backup and approval.

---

## 4. Recommended cost-controlled technology stack

| Layer | Recommended choice | Rationale / boundary |
|---|---|---|
| Web app | **Existing Next.js App Router + React + TypeScript** | Reuse uploaded ZIP; SSR, API/web routes, current components |
| Visual system | Tailwind CSS + accessible custom components / shadcn/ui selectively | Bespoke Workflow styling, not stock components |
| Identity | **Clerk** | Managed sign-up, verification, sessions, organization invitations; replace custom auth after audit |
| Relational source of truth | **Neon serverless PostgreSQL** | Standard Postgres, usage-based compute, direct Drizzle access |
| ORM / migrations | Drizzle ORM + reviewed SQL | Existing investment; strict constraints, tenant-aware migrations |
| Authorization | App-level RBAC **plus PostgreSQL RLS** | Never trust a browser-selected organization ID |
| Validation | Zod and database constraints | Request and domain-level validation |
| File storage | Cloudflare R2 | Original XLSX/CSV, exports, reports and attachments; only metadata in Postgres |
| Cache and rate limiting | Upstash Redis | Rate limits, bounded cache, distributed short-lived locks; not durable records |
| Durable jobs / schedules | Managed job platform with durable retries, or a separately hosted queue | Adapter abstraction; avoid long-running browser work in Next.js functions |
| Form and import workers | Node.js container workers + Playwright | Independently scaled from web tier; restricted networks and concurrency |
| Transactional email | Resend | Verified sender domain, templates, signed webhook status updates |
| Marketing email | Compatible email campaign provider when justified | Separate opt-in, unsubscribe and reputation from transactional traffic |
| SMS | Provider adapter; evaluate Nigeria-capable Termii or equivalent | Customer-approved sender IDs, per-message cost, delivery callbacks |
| Billing | Paystack as Nigeria-first option when monetization starts | Verified webhooks, idempotency and usage credits |
| Monitoring | Sentry + structured application/worker logs | Redact recipient data and secrets |
| Product analytics | Lightweight event aggregation; optional PostHog | Avoid tracking unnecessary PII |
| Web deployment | Vercel **Pro for commercial production**, other compatible host possible | Vercel Hobby is for personal non-commercial projects |
| Workers deployment | Managed container hosting (e.g., Railway/Fly/Cloud Run) | Expect a cost for reliable always-on or busy browser workers |

**Neon vs Supabase decision:** With Clerk doing identity and the existing app already using Drizzle/standard PostgreSQL, **Neon is a reasonable, coherent choice**. Use a **single shared Neon Postgres database with org-scoped tables and RLS**, not one database per free user. Neon scales compute separately from storage and may suspend compute when idle; **data persists during scale-to-zero**. Be aware the Free plan is intended for light workloads and has limited storage/compute. If the team prefers a bundled Auth + Postgres experience instead, use Supabase Auth + Supabase Postgres as an alternative—but choose **one** architecture and retest RLS accordingly.

**Free tier is an acquisition plan, not a promise that production infrastructure costs $0 forever.** Keep costly resources off the transactional DB; monitor compute, storage, browser minutes, communication charges and provider limits. Add real backups and a tested restore plan before holding important customer records.

---

## 5. Authentication, workspaces, access control

**Personas:** platform owner/admin (internal), customer workspace owner, customer admin, manager, member and viewer. One authenticated person can belong to several workspaces and switch context safely.

**Clerk integration:** signup/login, email verification, password reset or passwordless options, protected account settings, organization invitations and membership events. Clerk's basic organizations can supply initial admin/member primitives; the finer-grained Workflow permissions are stored and enforced in our own Postgres tables. Avoid building paid advanced organization-role features into the Free-cost baseline by assumption. Platform-admin status must be assigned only via a restricted backend process, never by writable profile metadata.

**Security design:** verify Clerk identity server-side on every protected request; resolve requested organization membership against trusted server data; enforce scopes in server services and PostgreSQL RLS. Carry user/org context only through **transaction-scoped** trusted variables or an explicitly reviewed JWT/RLS integration—not untrusted session-persistent connection values. Scoped database roles must not have unrestricted grants. Separate privileged workers/service database roles from ordinary user access. Test cross-tenant access and auth revocation against real PostgreSQL. Provide narrow initial organization creation that atomically provisions its first owner without arbitrary owner assignment.

**RBAC permission examples:** contacts.read/write/export; imports.create; campaigns.create/run; forms.analyze; communications.draft/send; sms.send; automations.manage; reports.view/export; team.invite; billing.manage; workspace.delete. Require strong authorization and audit for exports and bulk messaging.

---

## 6. Key application modules and functional requirements

### 6.1 Records and contacts — V1

CRUD for people/organizations; normalized emails and international phone numbers; tags, notes, custom field definitions/values; archive/restore; contact timeline; search/filter/sort; server pagination; org-scoped duplicate detection and review. One contact has many campaign memberships, submissions, messages, reminders and activity events. No silent fuzzy merging. Import UI must explain whether each row creates, updates, skips or flags a contact.

### 6.2 Imports — V1

XLSX/CSV upload to R2 with size/type validation, first-row inspection, user mapping, normalization, validation, duplicate review, preview and explicit commit. Track total/imported/updated/skipped/invalid counts with field-level error feedback and downloadable error CSV. Large files must be processed asynchronously; never depend on local disk in commercial hosting. Preserve original upload metadata and retention settings.

### 6.3 Campaigns — V1

Create a campaign from contacts, an import or selected segments. Campaign types: registration, communication, onboarding, event and custom operation. States: draft, ready, queued, running, paused, completed, archived. Detail view contains selected contacts, form destinations if used, message actions, scheduled reminders, results, retry/issue counts and activity. Every workflow state transition is auditable.

### 6.4 Communications Center — V1 priority

Create **transactional email**, **permission-based bulk email** and **permission-based bulk SMS** campaigns. Select org-scoped contacts; filter by tag/campaign/status; show consent eligibility and suppressed counts; deduplicate addresses/numbers per message; personalize safe variables; editor and preview; test sends to approved sender accounts; schedule/send; clear cost/credit estimate for SMS; confirmation before paid or large sends; cancellation before dispatch; track queued/accepted/sent/delivered/failed/bounced/opted-out only when provider evidence supports those states.

Use verified sender domains, SPF/DKIM/DMARC guidance for email, approved SMS sender ID and destination-country restrictions. Signed delivery webhooks must dedupe provider events and update each contact's communication timeline. Separate transactional notices from marketing consent. Add email unsubscribe, SMS STOP/opt-out where supported, bounce suppression, daily/organization quotas, per-recipient frequency caps and provider-reputation safeguards. No default fallback that reports a missing API key as successful delivery: mark demo/mock explicitly in development and disable misleading production success.

### 6.5 Forms and authorized destinations — V1

Organization registers the form destination, verifies ownership/administration or applicable written authorization; public-sector workflow requires the **agency_only** rule. Prevent SSRF (private/internal addresses, metadata endpoints, unsafe redirects, untrusted DNS changes). Analyze *authorized* dynamic forms with bounded workers, field identification, reusable form/version definitions, mappings and preflight validation. Manual verification is required when CAPTCHA/OTP/anti-bot challenges appear—no bypass. Store batch submission jobs, per-contact attempts and results with evidence. Retry **only known-safe transient errors**; uncertain external outcomes must go to review rather than blindly resubmit. Provide per-domain concurrency ceilings and user stop/pause controls.

### 6.6 Automations and reminders — V1.1

Schedule a personalized email/SMS at an exact date/time; time zone per workspace; trigger on registration success, status change or a manually selected audience. Recurring or condition-based reminders must be idempotent. Show queued, scheduled, due, sent, cancelled and failed executions. Safely pause/resume campaigns; suppress after opt-out. Introduce a visual workflow canvas only after the durable execution engine is reliable.

### 6.7 Reporting — V1 basic, V1.1 scheduled

Dashboard: new records, active campaigns, submissions by state, sent and accepted email/SMS, confirmed deliveries (where provider supports), pending attention and monthly usage. Campaign performance and recipient-level history; CSV/XLSX export. Scheduled PDF/email report jobs later. Do not conflate provider acceptance with delivery or message opens with successful communication.

### 6.8 Internal platform administration — V1 foundation

Separate role-restricted view for accounts, organizations, plan usage, failed jobs, abuse/spam review, sender health, webhook health, storage, worker availability, feature flags and audit events. Support controlled account suspension and complaint handling. Do not provide unrestricted impersonation by default.

---

## 7. Data model / schema domains

**Base tenant and identity:** `profiles` (Clerk subject mapping), `organizations`, `organization_members`, `invitations`, `roles`, `permissions`, `member_roles`, `platform_admins`.  
**People:** `contacts`, `contact_emails`, `contact_phones`, `custom_field_definitions`, `custom_field_values`, `tags`, `contact_tags`, `contact_notes`, `contact_identities`.  
**Campaigns / imports:** `campaigns`, `campaign_records`, `imports`, `import_files`, `import_errors`, `files`.  
**Forms:** `destinations`, `destination_authorizations`, `forms`, `form_versions`, `form_fields`, `field_mappings`, `submission_jobs`, `submission_attempts`, `submission_results`.  
**Communications:** `communication_campaigns`, `message_templates`, `messages`, `message_events`, `contact_channel_consents`, `suppression_entries`, `sender_identities`, `scheduled_messages`.  
**Workflow / system:** `automation_definitions`, `automation_runs`, `scheduled_jobs`, `activity_events`, `audit_logs`, `usage_events`, `usage_counters`, `plans`, `plan_limits`, `subscriptions`, `integration_connections`.

This is a **domain inventory, not an instruction to create all tables immediately**. Build a migration plan that maps existing 21-ish tables to a minimal normalized schema; add V1.1/V2 tables only when necessary. Each tenant table must have an organization-isolation proof (direct `organization_id` plus composite foreign keys where suitable, or a tested relationship-based RLS path). Use UUID/UUIDv7 identifiers as supported, unique normalized contact identities within the appropriate org and non-deceptive soft deletion. Store uploaded file bytes in R2, not Postgres. Avoid indexing every column; start with tenant+status/time/email/phone/campaign lookups. Make core messages, submission outcomes, audit and usage records durable; rotate high-volume debug logs to cheaper storage with retention.

**Suggested relation spine:** organizations 1—N contacts, campaigns, destinations, users through memberships; contacts N—N campaigns through campaign_records; destinations 1—N forms 1—N form_versions 1—N form_fields; campaigns 1—N jobs 1—N attempts and results; contact/campaign 1—N messages and activity events.

---

## 8. Non-functional requirements

**Security:** verify session/JWT, anti-CSRF for mutations, scoped DB roles and RLS, forbidden-field restrictions, minimal secret exposure, secrets rotation, encrypted integration credentials, safe upload parsing, virus scanning strategy, SSRF-safe URL analysis, per-IP/user/org/destination rate limits, append-oriented audit logs and strict worker egress controls.

**Reliability:** external dispatch via durable queues; per-operation idempotency keys; worker lease/heartbeat; bounded retries/backoff; dead-letter review; schema migrations with rollback plans; graceful failures; verified database backups and disaster recovery rehearsals before commercial critical use.

**Performance:** paginated and indexed large tables, import streaming/batching where appropriate, cached aggregate dashboard statistics with freshness labels, queue backpressure, no huge in-memory datasets in the browser, realistic mobile tests, accessible keyboard/focus behavior, site performance budgets and reduced-motion preferences.

**Privacy:** data minimization, clear consent provenance/channel/purpose, audience opt-out, privacy notices, configurable retention, legitimate deletion/export flows and a documented incident response process. Draft policies must be professionally reviewed before launch, particularly for regulated/public-sector workflows.

**Operational:** feature flags; structured correlated request/job logs; secure webhook verification; configuration checks on boot; metrics for database size/CU, Redis commands, R2 bytes, emails, SMS cost and browser minutes. Do not persist secrets or full sensitive form bodies in routine error logs.

---

## 9. Free, Pro and Business product packages

**These are proposed product quotas, not provider freebies or pricing commitments.** Validate costs first and make all caps configurable in `plan_limits` with atomic usage reservations so concurrent requests cannot exceed expensive quotas.

| Capability | Free (beta proposal) | Pro (proposal) | Business (proposal) |
|---|---:|---:|---:|
| Seats | 1 | 5 | custom |
| Active campaigns | 2 | 25 | custom |
| Stored contacts | 500 | 20,000 | custom |
| CSV/XLSX imports | limited | larger quotas | custom |
| Authorized form jobs | limited monthly | expanded | custom |
| Transactional email | modest monthly cap | expanded cap | high/custom |
| Marketing email | restricted and opt-in | enabled with compliance controls | higher volume |
| SMS | pay-as-you-go credit, no unlimited free allowance | purchased credits | negotiated billing |
| Reminders and scheduling | basic or limited | advanced | advanced |
| Reports | basic/manual | scheduled and export | advanced |
| Team and permissions | owner only | small teams | advanced roles |
| API / webhooks | later | when released | when released |

Never offer unmetered free Playwright time, SMS, AI calls or unbounded file storage. Introduce spend protection and staged limits to protect the startup and customers.

---

## 10. Premium marketing website and application IA

**Public pages:** Home, Product, Features, Solutions/Use Cases, How It Works, Pricing, Security, About, Contact, Privacy, Terms, Login and Sign Up. Never invent customer logos, fabricated testimonials or guaranteed success metrics.

**Homepage creative direction:** header with approved W/Workflow wordmark and concise navigation. Headline **“All your operations. In flow.”** Supporting line: **“Manage records, automate processes, send bulk email and SMS, organize campaigns, schedule reminders and track everything in one workspace.”** Primary CTA **Start free**; secondary **Explore the platform**. The central interactive hero should demonstrate an end-to-end UI workflow: spreadsheet import → customer record → campaign → email/SMS reminder → status timeline/report. Avoid making the entire hero only about form submission. Follow with actual product interface shots, communication and automation features, segments/use cases, security, clear pricing and CTA. Use premium art direction and purposeful animations; do not substitute generic imagery.

**App navigation:** Overview; People; Campaigns; Forms; Imports; Communications (Email, SMS, Templates, History); Automations (when active); Reports; Team; Integrations; Billing; Settings. Internal platform administration is separate.

**Important screens:** dashboard; contact table/details/timeline; campaign list/create/detail; import wizard; form destination/authorization/mapping/review; communication composer with audience/consent preview; bulk SMS credit confirmation; scheduled sends; delivery history; reporting/export; member roles; settings and usage; operational admin. Produce desktop and mobile responsive states plus loading, empty, error, partial-success, permission-denied and quota-exceeded states.

---

## 11. Versions and concrete deliverables

### Phase 0 — Repository reconciliation and design foundation
- Import existing ZIP or Git repo; audit security/data and preserve useful code.
- Confirm Next.js + Clerk + Neon decision; define migration/snapshot/rollback.
- Lock approved Workflow logo board, font identification/fallback and accessibility color tokens.
- Produce premium design system, desktop/mobile homepage prototype and core dashboard shell.
- Write minimal executable schema/RLS tests and deployment plan.

### V1.0 — Operational foundation + communications
- Secure multi-user authentication, organizations and tested permission/RLS isolation.
- Contacts and custom fields, duplicate review, CSV/XLSX uploads through R2.
- Campaigns and activity timeline; core import progress/errors.
- Verified sender email and consent-aware bulk email; consent-aware bulk SMS through a provider adapter; asynchronous queue-based sends, previews and truthful provider events.
- Basic campaign reports, usage metering, rate limits, support/admin and error monitoring.
- Authorize/verify external form destinations, static/dynamic form analysis and preview/mapping foundations. If live Playwright submission is not yet safe, label it Beta/Coming Soon instead of simulating live success.

### V1.1 — Automation and reliable execution
- Durable scheduled reminders and report delivery; saved dynamic segments and richer templates.
- Playwright submission worker with bounded concurrency, idempotency and human-action-required flow.
- Real submission result dashboards and issue-review queue.
- Additional communication analytics, retry controls and scheduled messages.

### V1.2 — Task-specific intelligence
- AI-assisted field mapping, data-cleaning suggestions, human-readable error classification and report summaries, all deterministically validated and separately metered.

### V2 — Complete native operations suite
- Hosted form builder; visual automation graph; payments; QR registration/check-in; receipts and document/certificate generation; integrations and shared inbox where validated by customers.

### V3 — Ecosystem and scale
- Public API/webhooks, broad integrations, advanced audit/enterprise RBAC, custom branding/domains, enterprise data residency where commercially justified. Add analytics warehousing/search/read replicas only in response to observed limits.

---

## 12. Acceptance criteria for Muse Spark and engineers

**Release must not be described as complete until all are demonstrated:**
1. **Brand:** approved board accurately reproduced; standalone and app icons supplied; wordmark original font identified or explicitly marked unverified; consistent responsive premium design.
2. **Security:** anonymous/Org A/Org B/dual-membership/role-revocation tests pass on real PostgreSQL; no privilege self-escalation.
3. **Contacts/imports:** multiple campaigns per person, safe duplicate handling, real XLSX/CSV import and R2-backed upload work; large imports do not block the web server.
4. **Messaging:** real Resend/selected SMS-provider sandbox and live authorized test send; consent, suppression, cost controls, genuine status callbacks; missing provider credentials cannot masquerade as a real send.
5. **Operations:** durable jobs, cancellation where feasible, retries, idempotency, status updates and failure review.
6. **Forms:** destination authorization checked before analysis/execution; anti-SSRF tests pass; manual verification challenges stop.
7. **Design QA:** keyboard/screen-reader behavior, mobile adaptation, reduced motion, genuine product UI renders and honest error/empty states.
8. **Deployment:** reproducible migrations, env example with no secrets, secured integrations, monitoring, rollback and backup plan. Commercial deployments on plans permitting commercial use.

**Handoff deliverables:** source repo with README; executable migrations/RLS tests; design tokens and reusable components; approved brand asset folder; production/staging config and `.env.example`; queue/worker deployment instructions; actual QA report with pass/fail/not-run; features/limitations register; list of paid services needed when usage increases. Stop and disclose unsupported capabilities rather than silently substituting mock results.

---

## 13. Evidence for current provider choice (reviewed September 2026)

- Clerk plans: https://clerk.com/pricing — published Free limits for retained users/organizations/team sizes; verify before launch.
- Neon free architecture and compute: https://neon.com/pricing and https://neon.com/blog/building-patterns-unlocked-by-scale-to-zero — limited free storage/compute, scale-to-zero; monitor live account quota.
- Supabase alternative: https://supabase.com/pricing — Free DB/Auth bundle, inactivity pausing, paid backups.
- R2 storage: https://developers.cloudflare.com/r2/pricing/ — 10 GB-month standard storage free allowance and operation limits.
- Upstash Redis: https://upstash.com/pricing/redis — free command/cache limits.
- Resend: https://resend.com/pricing — free transactional quota and daily caps.
- Vercel pricing and Hobby policy: https://vercel.com/pricing — free Hobby is personal/non-commercial; paid for commercial production.

**Open approvals:** final commercial brand/trademark clearance; exact logo font and licensed source vector; Clerk+Neon migration approval vs previous Supabase Auth approach; selected SMS provider, supported countries, sender requirements and launch budget; initial pricing/usage quotas; legal/privacy review of customer messaging and public-sector workflows.
