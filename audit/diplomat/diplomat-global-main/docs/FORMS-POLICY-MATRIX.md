# Diplomat Global — Forms Policy Audit Matrix

Audited: 2026-08-29

## Public Submission Forms

| Form | Data Collected | Privacy Notice | Terms Needed | Marketing Consent | Return/Refund/Warranty | Storage |
|------|---------------|----------------|-------------|-------------------|----------------------|---------|
| Contact (/contact) | name, email, subject, message | ✅ Short processing notice + Privacy Policy link + Terms link | ✅ Checkbox (required) | No | No | Supabase `contact_messages` |
| Product Request (/request) | first_name, last_name, email, phone, product_description, budget, brand, urgency | ✅ Implied by form purpose | No (not a purchase) | No | No | Supabase via `contact_messages` |
| Checkout (/checkout) | name, email, phone, address, state, LGA | ✅ Privacy Policy link in footer | ✅ Implied by order placement | Separate newsletter checkbox (not preselected) | ✅ Links to Returns/Refund/Warranty policies | Supabase `customers`, `orders` |
| Product Review (/products/$slug) | name, email, rating, title, body | ✅ Short processing notice | No | No | No | Supabase `reviews` |
| Newsletter (homepage) | email only | ✅ Footer privacy link | No | ✅ Explicit opt-in (not preselected) | No | Supabase via Brevo |
| Testimonial (/request or modal) | name, email, rating, message, consent | ✅ consent_to_publish checkbox | No | No (testimonial consent separate) | No | Supabase `testimonials` |

## Admin-Only Forms

| Form | Data Collected | Audit Logged | Server Validation |
|------|---------------|-------------|-------------------|
| Product CRUD | name, sku, category, price, stock, images | ✅ | ✅ `humanNameSchema` for names |
| Order Edit | status, notes | ✅ | ✅ RBAC required |
| Customer Edit | name, email, phone, address | ✅ | ✅ `humanNameSchema` for names |
| Role/Permission Edit | role_name, permissions | ✅ | ✅ Owner-only |
| Settings Edit | company info, delivery, announcements | ✅ | ✅ Owner-only |
| Email Campaign | subject, body, recipients | ✅ | ✅ RBAC required |
| Social Links CRUD | platform, label, url, sort | ✅ | ✅ RBAC required |
| Announcement CRUD | title, body, enabled | ✅ | ✅ RBAC required |
| Blog/Post CRUD | title, slug, content, category | ✅ | ✅ RBAC required |

## Privacy Policy Links

All public forms that collect personal data include a reference to the Privacy Policy (`/privacy-policy`) and Terms & Conditions (`/terms-and-conditions`).

## Marketing Consent Model

- **NOT preselected** on any form
- Separate from customer account status
- Stored with: `marketing_consent`, `marketing_consent_at`, `marketing_consent_source`
- Unsubscribe available via `/unsubscribe`
- Opt-outs preserved permanently — never re-subscribed automatically

## Name Validation

All personal name fields validated with:
- Client: `validateName()` from `name-validation.ts` (Unicode-aware, rejects numbers/symbols)
- Server: `humanNameSchema` from `validation.ts` (Zod-based, same rules)
- Applied to: checkout, reviews, contact, request, customer CRUD, blog/testimonial forms

## Phone Validation

All phone fields validated with:
- Client: `PhoneInput` component (international country selector, E.164 normalization)
- Server: `phoneSchema` from `validation.ts` (basic format check)
- Applied to: checkout, request form, customer edit
- Default country: Nigeria (+234)
- Supports: Nigeria, Ghana, Kenya, South Africa, UK, USA, Canada, Germany, France, India
