# System Breaker Mode — Permanent Engineering Rule

Every meaningful task on this repository must follow this process:

## Required Steps

1. **UNDERSTAND** — Read existing architecture before changing anything
2. **PLAN** — Identify what needs to change and what must NOT change
3. **BUILD** — Implement the smallest robust change
4. **QUESTION ASSUMPTIONS** — Never assume "it works" from code inspection alone
5. **BREAK SAFELY** — Deliberately test failure paths, not just happy path
6. **OBSERVE** — Capture runtime evidence: URLs, network calls, errors, DB state
7. **FIX** — Address failures found during observation
8. **VERIFY** — Confirm the fix resolves the original issue
9. **HARDEN** — Add regression tests or guards where practical
10. **REGRESSION TEST** — Verify other features still work
11. **DOCUMENT** — Report what was done, what was NOT tested, what remains blocked

## Governing Principle

AI BUILDS → AI IDENTIFIES ASSUMPTIONS → AI TRIES TO BREAK THEM SAFELY → OWNER CAN TRY TO BREAK THEM → BUG FOUND → REPRODUCE → ROOT CAUSE → FIX → RETEST → REGRESSION TEST → HARDEN

Whenever implementation appears complete, internally ask: **PROVE IT.**

---

## Completion Standard

Before declaring DONE/COMPLETE/PASS/FIXED, answer:

- What was implemented?
- What assumptions were made?
- How was the happy path tested?
- How was it deliberately broken?
- What authorization was tested?
- What failure states were tested?
- What regression test was added?
- What build/checks ran?
- Was committed code independently built?
- What remains untested?
- What is blocked?

If something was not tested, say: **NOT TESTED**.
Do NOT infer PASS from code inspection.

## What is NOT Sufficient Evidence

- Build passed
- Page rendered
- API returned 200
- Happy path worked once
- TypeScript compiled

## Commit Standard

- Build committed code in a clean worktree before pushing
- Never push unverified code
- Never commit secrets
- Conventional commit messages

## Forbidden Patterns

- Treating Clerk `userId`/`isSignedIn` as admin authorization
- Client-calculated payment amounts trusted by server
- Server-only secrets exposed via VITE_ or client bundles
- Audit spam from routine permission reads
- CSS-hiding unauthorized content instead of not rendering it
- Pagination by fetching all records and slicing client-side

---

## Mandatory Assumption Table

For every significant feature or bug fix, produce an assumption table:

```
ASSUMPTION:          [what we believe to be true]
HOW TO BREAK IT:     [action that tests the assumption]
EXPECTED SAFE BEHAVIOR: [what should happen if assumption is wrong]
TEST PERFORMED:      [what was actually done]
RESULT:              [PASS / FAIL / NOT TESTED]
```

---

## Manual Break Checklist

Every meaningful feature or audit must consider applicable items below.

### A. Secrets / API Keys

Inspect: browser Network tab, JS bundles, .env handling, public config, server/client import boundaries, Git history.

Look for: API keys, tokens, passwords, private keys, service-role credentials, DB credentials, webhook secrets, hardcoded credentials, authorization headers, stack traces.

**Rule:** Anything delivered to the browser is public. `VITE_*` = browser-visible. No server secret may use `VITE_*`.

### B. Authentication

Test: unauthenticated user, authenticated ordinary user, authorized Admin, unauthorized signed-in Clerk user, logout, expired session, stale page, incognito, direct protected URL, direct protected server function.

**Frontend hiding is not security.** Test the server authorization boundary.

### C. Input Validation

Test safely: empty, whitespace-only, long input, Unicode, emoji, malformed values, wrong type, negative number, zero, very large number, unexpected characters, harmless HTML-looking text.

Confirm: frontend behavior, backend validation, DB integrity, safe rendering.

### D. SQL/Query Safety

Use only non-destructive malformed inputs: `'`, `test'`. Look for: database errors, stack traces, unexpected auth behavior, server 500, unsafe query construction. Inspect for parameterized/query-builder use.

### E. XSS

Use safe inert markers: `<b>TEST</b>`. Inspect: contact messages, testimonials, reviews, customer names, Admin tables, blog/CMS, search, route params. Confirm HTML is escaped unless explicitly intended and sanitized.

### F. File Uploads

Test safely: wrong extension, unsupported MIME, invalid image content, empty file, oversized file, long filename, duplicate filename, renamed non-image. Confirm: server validation, size limits, Cloudinary-only, no Supabase Storage, no executable content.

### G. URL/Resource Manipulation

For routes with IDs: change ID, nonexistent ID, another entity's ID, malformed ID. Confirm server authorization prevents IDOR/data leakage.

### H. Repeated Actions / Idempotency

Test: double-click, rapid submit, browser refresh during operation, two tabs, duplicate request, duplicate webhook. Especially: checkout, pay, contact, newsletter, Admin mutations, inventory, payment webhook, coupon usage. **Verify database state, not only UI.**

### I. Network Breaking

Test: offline, slow connection, connection loss mid-action, restored connection, retry. Look for: infinite loaders, duplicate submission, false success, lost form state, broken UI, unhandled exception.

### J. API Failure Behavior

Consider: 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, timeout, empty result, malformed result. Do not assume every request succeeds.

### K. Rate Limiting

Inspect and safely test: login, contact, newsletter, search, payment initialization, webhook endpoints, Telegram. Never perform abusive traffic against production.

### L. Payments — State Machine Testing

States: INITIATED → PROCESSING → SUCCESS / FAILED / ABANDONED / TIMEOUT / DUPLICATE CALLBACK / DELAYED CALLBACK / NETWORK LOST AFTER PAYMENT / BROWSER CLOSED AFTER PAYMENT.

**Browser success is never authoritative.** Trusted Paystack verification/webhook determines final state.

### M. Database Failure

Where safely reproducible in dev/test, verify graceful behavior when DB/API becomes unavailable. Do not damage production.

### N. Authorization vs Hidden UI

Verify: UI permission + server authorization + database/data-boundary authorization. Hidden button alone is not security.

### O. Mobile Testing

Test at: narrow mobile, normal mobile, landscape, tablet, desktop, wide desktop, 200% zoom, long content, software keyboard. Inspect: overflow, overlap, inaccessible buttons, off-screen modals, touch targets, broken navigation.

### P. Accessibility

Check: keyboard navigation, visible focus, semantic elements, modal escape/focus, form labels, error association, alt text, zoom. Automated checks are supporting evidence, not complete proof.

### Q. Repository Danger Search

Search for: API keys, tokens, passwords, private keys, hardcoded secrets, debug modes, console.log with secrets, stack traces, TODO security, temporary bypasses, disabled auth, VITE_ secrets. Check tracked files, public/, build outputs, Git history, .gitignore. Never disclose secrets.

---

## Payment Specific: Paystack Test Mode

- Use only `pk_test_` / `sk_test_` keys
- Never print actual keys
- Never commit them
- Never put `sk_test_` in VITE_*, browser JS, localStorage, logs, audit_logs, Telegram messages
- Secret key must remain server-side
- Server-calculated amount must be authoritative
- Webhook signature validation mandatory

---

## Graphiti Isolation

Graphiti is a future knowledge/memory component. It must be installed as an isolated service boundary:

```
Diplomat TanStack application
    │ controlled server API
    ▼
Graphiti service (Python, isolated)
    │
    ▼
Neo4j / supported graph DB
```

- Isolated Python environment under `services/graphiti/`
- Never put Graphiti deps into package.json
- No production DB without owner approval
- INSTALLATION = PASS only when: isolated env created, graphiti-core imports, deps documented, secrets excluded, main app still builds
- LIVE INGESTION = BLOCKED until graph DB + AI provider credentials available
