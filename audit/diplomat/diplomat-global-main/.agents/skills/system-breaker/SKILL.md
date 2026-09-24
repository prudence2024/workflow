---
name: system-breaker
description: Primary adversarial engineering methodology. Build, question assumptions, break safely, verify, fix, retest, harden. Use when testing any feature, fix, or system component.
version: 1.0.0
source: Diplomat Global Engineering Standards + Prudence Codex Security
---

# System Breaker

The permanent engineering question: **PROVE IT.**

## Workflow

1. **UNDERSTAND** — Read existing architecture
2. **PLAN** — Identify what changes and what must NOT change
3. **BUILD** — Implement smallest robust change
4. **IDENTIFY ASSUMPTIONS** — Document every assumption
5. **BREAK SAFELY** — Deliberately test failure paths
6. **OBSERVE** — Capture runtime evidence
7. **REPRODUCE** — Confirm the failure is real
8. **ROOT CAUSE** — Identify why it failed
9. **FIX** — Implement targeted correction
10. **RETEST** — Confirm original failure is resolved
11. **HARDEN** — Add regression guards
12. **REGRESSION TEST** — Verify other features still work
13. **CLEAN COMMITTED BUILD** — Build from clean worktree
14. **COMMIT + PUSH** — Conventional messages, no secrets
15. **DOCUMENT** — Report evidence, not claims

## What is NOT Evidence

- Code compiles
- Build passed once
- Page rendered
- API returned 200
- Happy path worked once
- Previous report says fixed

## Assumption Table

Every significant fix produces:

```
ASSUMPTION:       [what we believe]
HOW TO BREAK IT:  [action that tests it]
EXPECTED:         [safe behavior if wrong]
TEST:             [what was done]
EVIDENCE:         [what was observed]
RESULT:           [PASS / FAIL / NOT TESTED]
```

## Manual Break Checklist

### Secrets
Inspect: DevTools Network, JS bundles, .env, Git history.
Rule: VITE_* = browser-visible. No server secret under VITE_*.

### Authentication
Test: unauthenticated, authorized Admin, non-Admin, inactive, expired, logout, incognito, direct URL.

### Input Validation
Test: empty, whitespace, long, Unicode, emoji, HTML-looking, wrong type, zero, negative, large.

### SQL Safety
Harmful inputs: `'`, `test'`. Check for DB errors, stack traces, 500s.

### XSS
Marker: `<b>TEST</b>`. Check: reviews, testimonials, contacts, CMS, search.

### Uploads
Test: wrong extension, invalid MIME, empty, oversized, duplicate, renamed.

### IDOR
Test: change ID, nonexistent, another entity's, malformed.

### Idempotency
Test: double-click, rapid submit, refresh mid-action, duplicate webhook.

### Network
Test: offline, slow, disconnect mid-action, reconnect.

### API Failures
Consider: 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, timeout.

### Payments
State machine: INITIATED → PROCESSING → SUCCESS/FAILED/ABANDONED/TIMEOUT/DUPLICATE.
Browser success is never authoritative.

### Mobile
Test: narrow, landscape, tablet, desktop, wide, zoom, keyboard open.

### Accessibility
Check: keyboard nav, focus, semantic controls, labels, alt text, zoom.

### Repository Scan
Search: keys, tokens, passwords, debug bypasses, VITE_ secrets, Git history.

## Evidence Classification

Every PASS must state its evidence:
- CODE INSPECTION
- UNIT TEST
- INTEGRATION TEST
- DB QUERY
- BROWSER RUNTIME
- PROVIDER TEST MODE
- CLEAN COMMITTED BUILD
- OWNER RUNTIME CONFIRMATION

If only source inspection: **CODE INSPECTION ONLY — RUNTIME NOT VERIFIED**
