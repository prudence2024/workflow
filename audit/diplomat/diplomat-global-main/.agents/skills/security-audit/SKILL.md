---
name: security-audit
description: Production security assessment for web apps. Inspect secrets, auth, input handling, API security, uploads, payments, webhooks, headers, dependencies. Adapted from Prudence Codex security skill.
version: 1.0.0
source: Prudence Codex security skill (adapted)
---

# Security Audit

Assess evidence-backed application, API, data, and production security controls. Treat security as a launch gate.

## Workflow

1. Validate project context: environment, assets, trust boundaries, data classes, actors, integrations
2. Inspect repository and authorized runtime evidence
3. Establish threat scenarios using likelihood, impact, reachability
4. Review applicable controls
5. Implement only authorized changes
6. Validate locally and against intended environment
7. Record decisions and produce report

## Control Areas

### Secrets & Environment
- VITE_* = browser-visible (never secrets)
- Server secrets: process.env only
- .env not committed
- No secrets in logs, audit, Telegram, client bundles

### Authentication & Authorization
- Clerk session → admin_users → role_id → RBAC
- Never authorize via deprecated admin_users.role
- Server-side enforcement mandatory
- Hidden UI is not security

### Input & Output
- Server-side validation for all inputs
- Parameterized queries (Supabase query builder)
- HTML escaping unless explicitly sanitized
- Mass assignment protection

### API & Webhooks
- HMAC-SHA512 for Paystack webhooks
- Rate limiting on sensitive endpoints
- Idempotency for payment webhooks
- CORS properly configured

### Payments
- Server-calculated amounts authoritative
- Browser amounts untrusted
- Transaction verification before fulfillment
- Idempotent webhook handling

### Dependencies
- Lockfile present
- No known vulnerabilities in critical deps
- Supply chain awareness

## Evidence Rules

- Label: confirmed, likely, informational, not applicable, not verified
- Never expose secrets in reports
- No destructive/exploitative testing without authorization
- Client validation is insufficient substitute for server controls
- Report three highest-risk blockers first
