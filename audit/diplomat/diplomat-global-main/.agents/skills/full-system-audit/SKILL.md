---
name: full-system-audit
description: Orchestrate complete system audit using specialist skills. Covers auth, security, payments, checkout, database, UI, deployment, Telegram.
version: 1.0.0
---

# Full System Audit

Orchestrates specialist skills across the entire codebase.

## Skills Used

| Skill | Scope |
|---|---|
| system-attacker | Adversarial assumption testing across all domains |
| system-breaker | Build, question, break safely, verify, fix, retest, harden |
| security-audit | Secrets, auth, input, API, uploads, payments, headers |
| session-guard | Session timeout, auth state, cross-tab behavior |
| auth-rbac-breaker | Login, RBAC, permissions, role management |
| payments-paystack-test | Paystack test E2E, webhook, idempotency |
| checkout-breaker | Price authority, cart, coupons, delivery, orders |
| database-integrity | Schema, constraints, FK, orphans, concurrency |
| deployment-verifier | Clean committed build, worktree verification |
| ui-ux-breaker | States, responsive, accessibility, error UX |
| telegram-ops-test | Bot connectivity, commands, alerts, auth |
| requirements-auditor | Requirements coverage against implementation |
| seo-discoverability | Sitemap, robots, llms.txt, metadata, structured data |
| performance-breaker | Performance profiling, bottleneck identification |
| post-production-audit | Pre-launch production-readiness audit |

## Area Coverage

### Authentication / Authorization
- Clerk → admin_users → role_id → RBAC
- Login flow all states
- Permission enforcement (sidebar, routes, functions)
- Role management

### Commerce
- Products, categories, inventory
- Checkout, coupons, orders
- Paystack payments, receipts
- Delivery fee consistency

### Admin
- All table pagination
- CRUD operations
- Audit logging
- Staff management
- Settings

### Content
- CMS pages (About, Terms, Privacy, Warranty)
- Blog, hero slides, testimonials
- Social links
- Media (Cloudinary)

### Integrations
- Clerk (auth)
- Supabase (DB)
- Cloudinary (media)
- Paystack (payments)
- Telegram (ops)
- Resend/Brevo (email)
- Sentry (errors)

### Infrastructure
- Environment variables
- Build/deploy pipeline
- Error handling
- Rate limiting

## Process
1. Run each specialist skill
2. Collect findings
3. Classify: BLOCKER / CRITICAL / HIGH / MEDIUM / LOW
4. Fix safe findings automatically
5. Report remaining with owner action items
