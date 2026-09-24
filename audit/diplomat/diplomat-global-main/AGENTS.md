
## Engineering Standards

This project follows **System Breaker Mode** for all meaningful tasks.
See `docs/SYSTEM-BREAKER-MODE.md` for the full process.
Reusable testing skills live in `.agents/skills/`.

### Always-On Rules

- Never expose secrets (VITE_* = browser-visible, never secrets)
- Never fabricate test evidence
- Distinguish authentication from authorization
- Important business rules belong server-side
- Browser prices/totals are untrusted
- Server authorizes all Admin actions
- Build committed code before deployment claims
- Significant fixes require regression verification
- Report untested areas honestly
- No force push, no secret commits

### Architecture

- Clerk identity → admin_users → active → role_id → roles → role_permissions → permissions
- Paystack webhook HMAC-SHA512 uses PAYSTACK_SECRET_KEY (no separate webhook secret)
- Server-calculated amounts are authoritative for payments
- Coupon discount calculated server-side, never trusted from client

### Skills

Invoke specialist skills for focused testing:
- `/skill:system-breaker` — primary adversarial methodology
- `/skill:security-audit` — security controls assessment
- `/skill:auth-rbac-breaker` — login and permission testing
- `/skill:payments-paystack-test` — Paystack test E2E
- `/skill:checkout-breaker` — checkout flow integrity
- `/skill:database-integrity` — schema and data integrity
- `/skill:deployment-verifier` — clean committed build
- `/skill:ui-ux-breaker` — UI/UX state testing
- `/skill:telegram-ops-test` — Telegram bot verification
- `/skill:full-system-audit` — orchestrate all specialists
