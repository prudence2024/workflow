---
name: telegram-ops-test
description: Test Telegram Operations Bot. Connectivity, webhook, commands, authorization, alerts, failure isolation.
version: 1.0.0
---

# Telegram Ops Test

## Connectivity
- getMe: bot identity valid
- getChat: admin chat accessible
- Bot ID ≠ TELEGRAM_ADMIN_CHAT_ID (destination must be owner, not bot)

## Webhook
- Registered at POST /api/webhook/telegram
- TELEGRAM_WEBHOOK_SECRET validated (if configured)
- Idempotent update handling
- Rate limiting active

## Authorization
- Authorized chat ID → commands work
- Unauthorized chat → "Access denied." only
- No business data to unauthorized users
- Username alone cannot authorize

## Commands
- /start → command menu
- /help → command descriptions
- /status → business/system snapshot
- /health → service health
- /payments → recent payments
- /revenue → verified revenue
- /leads → contacts & subscribers

## Alerts
- Payment success → Telegram (best-effort)
- Contact submission → Telegram (best-effort)
- Newsletter signup → Telegram (best-effort)
- Order creation → Telegram (best-effort)
- Low-stock transition → Telegram (cooldown)

## Failure Isolation
- Telegram failure must NOT:
  - Roll back payment
  - Fail order creation
  - Fail contact save
  - Fail newsletter signup
  - Fail inventory update

## Evidence
- Bot API response codes
- Admin Integrations page status
- DB: audit_log for telegram events
- Server logs for webhook processing
