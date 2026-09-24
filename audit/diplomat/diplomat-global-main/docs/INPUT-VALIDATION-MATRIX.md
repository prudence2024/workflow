# Diplomat Global — Input Validation Matrix

Every public and admin input field, its validation, normalization, and server enforcement.

## Human Name Fields

| Route/Page | Field | Client Validator | Server Validator | Normalization | DB Format | Error UX |
|---|---|---|---|---|---|---|
| /contact | name | `humanNameSchema` | `humanNameSchema` | trim, NFC | varchar | "Enter a valid name" |
| /reviews | customer_name | `validateName()` | `humanNameSchema` | trim, NFC | varchar | "Name contains invalid characters" |
| /request | first_name, last_name | `validateName()` | `humanNameSchema` | trim, NFC | varchar | "Name cannot contain numbers" |
| /checkout | first_name, last_name | HTML required | `humanNameSchema` | trim, NFC | varchar | Zod error |
| Admin testimonial | name | — | `humanNameSchema` | trim, NFC | varchar | Zod error |
| Admin customer edit | first_name, last_name | — | `humanNameSchema` | trim, NFC | varchar | Zod error |
| Admin profile | display_name | — | `humanNameSchema` | trim, NFC | varchar | Zod error |

### Name Validator Rules
- Accepts: Unicode letters (`\p{L}`), combining marks (`\p{M}`), spaces, apostrophes (`'`, `'`, `ʼ`), hyphens (`-`, `–`, `‐`), periods
- Rejects: digits, angle brackets, control characters, emoji-only, <30% letters
- Normalization: trim, Unicode NFC
- Length: 1–120 characters

## Phone Number Fields

| Route/Page | Field | Client Validator | Server Validator | Normalization | DB Format | Error UX |
|---|---|---|---|---|---|---|
| /request | phone | `PhoneInput` + `validatePhone()` | `phoneSchema` (libphonenumber) | E.164 | varchar | "Enter a valid phone number" |
| /checkout | phone | `PhoneInput` | indirect (customer record) | E.164 | varchar | — |
| Admin customer edit | phone | `PhoneInput` | `validatePhoneWithLock()` | E.164 + Nigerian normalize | varchar | "Phone must be Nigerian" when locked |
| Admin settings | phone | — | `phoneSchema` | E.164 | site_settings | Zod error |

### Phone Lock Enforcement
- Setting: `phone_lock_nigeria` in `site_settings`
- When ON: server rejects non-Nigerian numbers via `validatePhoneWithLock()`
- When OFF: Nigeria default, international allowed
- Admin customer edit: enforced (no exception)
- Server uses `libphonenumber-js` `parsePhoneNumberFromString` for validation

## Email Fields

| Route/Page | Field | Client Validator | Server Validator | Normalization | DB Format |
|---|---|---|---|---|---|
| /contact | email | `type="email"` | `emailSchema` | trim, lowercase, max 254 | varchar |
| /reviews | customer_email | `type="email"` | `emailSchema` | trim, lowercase | varchar |
| /request | email | `type="email"` | `emailSchema` | trim, lowercase | varchar |
| /checkout | email | `type="email"` | — (Paystack handles) | trim, lowercase | varchar |
| Newsletter | email | HTML email input | `newsletterSubscribeSchema` | trim, lowercase | varchar |

### Email Validation Rules
- Zod `.email()` validation
- Trimmed and lowercased
- Max 254 characters
- Server authoritative

## URL Fields

| Route/Page | Field | Client Validator | Server Validator | Normalization |
|---|---|---|---|---|
| Admin social links | url | HTML `type="url"` | `urlSchema` (Zod `.url()`) | trim |
| Admin settings | whatsapp_url | HTML `type="url"` | `urlSchema` or empty | trim |
| Admin settings | google_maps_* | HTML `type="url"` | `urlSchema` or empty | trim |
| Admin blog | youtube_url | HTML `type="url"` | `urlSchema` or empty | trim |

### URL Validation Rules
- Zod `.url()` — must be valid URL
- Max 2000 characters
- Protocols: http/https accepted
- No javascript: or data: (Zod url() rejects these)

## Address Fields

| Route/Page | Field | Client Validator | Server Validator | Normalization |
|---|---|---|---|---|
| /contact | (no address input) | — | — | — |
| Admin customer edit | address | — | `freeTextSchema(0, 500)` | trim, control-char strip |
| Checkout | address | HTML | — (Paystack) | — |

### Address Rules
- Accepts: letters, numbers, hyphens, commas, periods, slashes, apostrophes, `#`, Unicode
- NOT validated with human-name rules
- Sensible max length
- Server sanitization: control character removal

## Numeric / Price Fields

| Route/Page | Field | Client Validator | Server Validator | Normalization |
|---|---|---|---|---|
| Admin product | price | `type="number"` | `priceSchema` (0–100M) | parseFloat |
| Admin product | compare_at_price | `type="number"` | `priceSchema` optional | parseFloat |
| Admin product | cost_price | `type="number"` | nullable numeric | parseFloat |
| Admin product | stock | `type="number"` | `positiveIntSchema` | parseInt |
| Admin expense | amount | `type="number"` | `priceSchema` | parseFloat |
| Admin expense | quantity | `type="number"` | `positiveIntSchema` | parseInt |
| Admin coupon | discount_value | `type="number"` | min(0.01) | parseFloat |
| Admin coupon | min_order_amount | `type="number"` | min(0) optional | parseFloat |

### Numeric Rules
- Server parses with `z.coerce.number()` or `z.number()`
- Never trusts `input.type="number"` alone
- NaN/Infinity rejected by Zod
- Decimal precision: 2 places for currency
- Integer for quantity/stock

## SKU / Business Identifiers

| Route/Page | Field | Client Validator | Server Validator | Normalization |
|---|---|---|---|---|
| Admin product | sku | text input | `freeTextSchema(0, 50)` | trim, uppercase |

### SKU Rules
- Permits: letters, numbers, hyphens, underscores
- NOT validated with human-name rules
- Preserved uniqueness
- Trimmed

## Free Text / Textarea Fields

| Route/Page | Field | Client Validator | Server Validator | Normalization |
|---|---|---|---|---|
| /contact | message | `textarea` required | `freeTextSchema(10, 5000)` | trim, control-char strip |
| /reviews | body | `textarea` required | `freeTextSchema(10, 5000)` | trim |
| /request | details | `textarea` optional | `freeTextSchema(0, 5000)` | trim |
| Admin product | description | `textarea` | `freeTextSchema(0, 10000)` | trim |
| Admin blog | content | `textarea` | `freeTextSchema(0, 50000)` | trim |
| Admin expense | notes | `textarea` | `freeTextSchema(0, 2000)` | trim |
| Admin testimonial | message | `textarea` | `freeTextSchema(1, 2000)` | trim |

### Free Text Rules
- Sensible min/max length
- Control character removal: `[\x00-\x08\x0B\x0C\x0E-\x1F]`
- No restrictive name regex applied
- XSS protection via output encoding

## Slug Fields

| Route/Page | Field | Client Validator | Server Validator | Normalization |
|---|---|---|---|---|
| Admin product | slug | auto-generated | `slugSchema` | lowercase, hyphen-separated |
| Admin blog | slug | auto-generated | `slugSchema` | lowercase, hyphen-separated |
| Admin category | slug | auto-generated | `slugSchema` | lowercase, hyphen-separated |
| Admin page | slug | text input | `slugSchema` | lowercase, hyphen-separated |

### Slug Rules
- Pattern: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`
- Max 200 characters

## Password / Secret Fields

| Route/Page | Field | Rules |
|---|---|---|
| Clerk login | password | NOT trimmed, NOT transformed. Clerk handles. |
| Admin webhook secret | secret | Stored encrypted. Never logged. |
| Admin API keys | key | Stored encrypted. Never logged. |

### Secret Rules
- Never trim or silently transform
- Never log passwords, API keys, webhook secrets, auth tokens

## Autocomplete Attributes

| Field Type | Autocomplete Value |
|---|---|
| First name | `given-name` |
| Last name | `family-name` |
| Full name | `name` |
| Email | `email` |
| Phone | `tel` |
| Street address | `street-address` |
| Address line 1 | `address-line1` |
| Address line 2 | `address-line2` |
| City | `address-level2` |
| State | `address-level1` |
| Postal code | `postal-code` |
| Country | `country` |

## Server Authority Rule

For every form:
- Browser validation = convenience UX only
- Server validation = truth
- Direct API/serverFn calls bypass browser validation
- Server schemas MUST independently validate all fields
