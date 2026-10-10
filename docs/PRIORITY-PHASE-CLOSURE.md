# Workflow priority phase closure

Only testing is in scope. Runtime acceptance must not be inferred from source or fixture tests.

## 3A — auth and onboarding

Clerk remains the identity authority. Initial signup uses Clerk; profile information is collected in the existing onboarding flow. Required Nigerian phone numbers are normalized; no onboarding SMS is sent. Persisted progress now determines the step when a URL has no explicit step. Paid plan selection remains an intent and grants no paid access.

Remaining hosted gates: fresh email/social callback, established login, session completion/recovery, personal/organization creation once, membership/subscription/current-org state, and responsive auth visuals. The controllable authenticated browser currently times out. Clerk's optional/required signup-field configuration must be confirmed in that instance; rendering SignUp alone does not prove auth-only runtime.

## 4B — form automation

The prepared consumer is `workflow-form-worker-testing`, started with `npm run form-worker`. A browser-capable external container host is not provisioned. Startup requires development and a dedicated restricted database URL, checks login privileges, and supplies the same restricted connection to both child workers.

Remaining host gates: deployed restricted-role check, atomic concurrent claim, crash/retry recovery, controlled analysis and real submission with evidence, no duplicate execution, tenant isolation, and reporting/health truth. Source checks cannot close this phase.

## 4C — dashboard and responsive UI

The component fixture uses actual React components and production CSS, with only navigation and actions stubbed. It checks closed/open drawer, workspace/account menus, AI panel, wide table containment, desktop collapse and persistence, distinct icon motion, reduced motion, and theme refreshes. These are local component results, not authenticated route acceptance.

Remaining hosted gates: all authenticated routes and requested widths, dropdowns and scroll restoration, auth visuals, animation visibility, and marketing/footer visuals. Footer socials need real X, LinkedIn, and Instagram URLs; absent URLs stay hidden. Requested `/records` and `/settings` do not exist as direct routes: current destinations are `/contacts` and `/settings/organization` (plus other settings subroutes). Do not count a 404 or login redirect as route acceptance.

## 5 — billing, plans, limits and credits

Approved monthly NGN prices: Free 0, Pro 31,500, Plus 100,000. Internal entitlement keys remain free/pro/plus, with business only a Plus alias. No FX conversion. Pricing and active entitlements are separate. Current server enforcement and pending intent do not constitute a completed payment integration.

Paystack TEST credentials are not configured in the inspected local environment or testing Worker. Remaining implementation/runtime: checkout initialization, verified callback/webhook convergence, durable payment idempotency, receipts, subscription transitions, and upgrade/downgrade controls. Never activate from query parameters or a client success message. Store expected amount in integer kobo (Pro 3,150,000; Plus 10,000,000) and verify currency, reference, success state and amount against server records.

Recommended policy for owner approval: upgrades/downgrades effective at the next monthly renewal with no automatic proration/refund in the first release. If immediate upgrades are needed, specify the credit and rounding policy before implementation.

Credit model recommendation: keep subscription entitlements separate from purchased credits. Use an append-only per-workspace ledger in a single specified unit, with a unique source/event key. Reserve credits atomically before execution; settle against verified completion and release reservations after known failure. An unknown submission result must not be charged or retried as if success/failure were proven. No top-up value, exchange rate, expiry or refund policy is approved yet; do not invent one.

## 8 — observability and operations

Existing app surfaces: `/api/health/live` and `/api/health/ready`; prepared form consumer: `/health`. Diagnostics now emit safe error classes/codes and never raw SQL/provider message payloads.

Remaining source/provider work: Sentry integration and testing DSN, Infisical project/access configuration, deployed worker/queue heartbeat, provider status, and uptime/alert delivery configuration. Environment variable examples are not proof of configured integrations.

Proposed alert policy: page on sustained readiness failure or stale worker heartbeat beyond multiple poll cycles; aggregate recurring queue failures; suppress isolated aborted navigations and transient single-check failures. Recipient, monitoring provider and incident ownership remain to be configured. Do not expose aggregate queue/customer data on public health endpoints. Operations diagnostics require platform authorization.

## Completion rule

Each ready-to-close gate remains NO until its source, focused tests and hosted/provider evidence are complete. No production, main, commit or push is authorized.
