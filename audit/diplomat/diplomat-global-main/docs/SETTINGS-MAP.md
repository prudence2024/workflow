# SETTINGS MAP

> Updated: 2026-08-31

## Business Identity Settings

| Setting | DB Key | Admin UI | Server Consumer | Public Consumer | Fallback |
|---------|--------|----------|-----------------|-----------------|----------|
| Business Address | `location` | Settings page | Contact loader, Footer | Contact page, Footer | `BUSINESS_ADDRESS` constant |
| Support Email | `support_email` | Settings page | Contact loader, Footer | Contact page, Footer | `support@diplomatglobal.com.ng` |
| Phone | `phone` | Settings page | Contact loader, Footer | Contact page, Footer | `+234 803 575 1338` |
| WhatsApp URL | `whatsapp_url` | Settings page | Footer | Footer (conditional) | None (hidden if absent) |
| Maps/Location URL | `maps_url` | Settings page | Contact loader | Contact page map card | `DEFAULT_MAPS_DIRECTIONS_URL` |
| Company Name | `company_name` | Settings page | Footer | Footer copyright | `Diplomat Global Tech-Solutions` |
| Logo | `logo_url` | Settings page | BrandLogo component | Header, Footer | Default logo |

## Phone Lock Setting

| Setting | DB Key | Admin UI | Server Consumer | Client Consumer |
|---------|--------|----------|-----------------|-----------------|
| Lock phone to Nigeria | `phone_lock_nigeria` | Settings toggle | `validatePhoneWithLock()` in all server functions accepting phone | PhoneInput `countryLocked` prop |

When `phone_lock_nigeria = "true"`:
- Server rejects non-Nigerian numbers (E.164 must start with +234)
- Client PhoneInput shows only Nigeria selector
- Applies to: checkout, contact form, admin customer edit, request form

## Social Links

| Setting | DB Key | Admin UI | Server Consumer | Public Consumer |
|---------|--------|----------|-----------------|-----------------|
| Social links | `social_links` table | Social Links page | Footer, Contact | Footer icons, Contact |

DB is authoritative. Zero links = zero links shown. No hardcoded fallbacks.

## Announcements

| Setting | DB Key | Admin UI | Server Consumer | Public Consumer |
|---------|--------|----------|-----------------|-----------------|
| Announcements | `site_settings.announcements` | Settings/Announcements | Root loader | Announcement bar in header |

Rotates enabled announcements at configured interval. Dismissed state stored in localStorage.

## Newsletter / Marketing

| Setting | DB Key | Admin UI | Server Consumer | Public Consumer |
|---------|--------|----------|-----------------|-----------------|
| Marketing status | `newsletter_subscribers.marketing_status` | Newsletter page | Subscribe function | "Already subscribed" guard |

States: `Subscribed`, `Unsubscribed`, `Unknown`
- Explicit newsletter signup → Subscribed
- Customer purchase ≠ marketing consent
- Opted-out → never silently resubscribed

## Categories

| Setting | DB Key | Admin UI | Server Consumer | Public Consumer |
|---------|--------|----------|-----------------|-----------------|
| Categories | `categories` table | Categories page | Root loader | Header nav, Shop sidebar, Homepage, Footer |

100% DB-driven. Admin adds category → all locations update automatically.

## Integrations

| Setting | DB Key | Admin UI | Server Consumer | Public Consumer |
|---------|--------|----------|-----------------|-----------------|
| Brevo API Key | `BREVO_API_KEY` env | Not in UI (env only) | Newsletter, Marketing email | None |
| Brevo List ID | `BREVO_MARKETING_LIST_ID` env | Not in UI (env only) | Newsletter subscription | None |
| Paystack Key | `PAYSTACK_SECRET_KEY` env | Not in UI (env only) | Payment processing | None |
| Telegram Token | `TELEGRAM_BOT_TOKEN` env | Integrations page | Webhook, Commands | None |

## Settings Validation Rules

| Field | Client Validator | Server Validator | Normalization |
|-------|-----------------|-----------------|---------------|
| Email | `z.string().email()` | Same | trim, lowercase |
| Phone | `react-phone-number-input` | `validatePhoneWithLock()` | E.164 storage |
| Address | Free text, max 500 chars | Trim, reject control chars | NFC normalize |
| Map URL | `z.string().url()` | Reject `javascript:`, `data:` | trim |
| WhatsApp URL | `z.string().url()` | Reject `javascript:`, `data:` | trim |
| Nigeria Lock | Boolean toggle | `"true"` or `"false"` string | — |
