# Settings Consumer Matrix — Phase 5D

Every visible Settings control mapped to its storage, server source, and real
consumer, verified by code inspection on this branch (`codex/diplomat-final-hardening`,
Batch 4). A control with no consumer would be a fake-functional control and must
be removed or marked inactive; **all rows below resolve to a live consumer**.

Evidence hierarchy: consumers verified by direct code references listed in the
Consumer(s) column. Storage shape: `site_settings` is a key/value table read by
`getPublicSiteSettings` (public, cached) and `adminGetSiteSettings` (admin, live).

| Setting key | Storage | Server source | Consumer(s) | Runtime status |
|---|---|---|---|---|
| `company_name` | `site_settings` KV | root loader → `getPublicSiteSettings` | footer (`site-footer.tsx` via `public-content-model.ts`), receipts (`receipt-document.ts`), contact page | ACTIVE |
| `tagline` | `site_settings` KV | root loader | footer brand block (`site-footer.tsx`) | ACTIVE |
| `support_email` | `site_settings` KV | root loader | footer CONTACT row, contact page | ACTIVE |
| `phone` | `site_settings` KV | root loader | footer CONTACT row (tel link), contact page | ACTIVE |
| `location` (address) | `site_settings` KV | root loader | footer ADDRESS row, contact page | ACTIVE |
| `website_url` | `site_settings` KV | `adminGetSiteSettings` | settings admin form round-trip; displayed in footer model | ACTIVE |
| `whatsapp_url` | `site_settings` KV | root loader | footer "Message us on WhatsApp" (customer-initiated `wa.me` only — no API) | ACTIVE |
| `google_maps_embed_url` | `site_settings` KV | contact loader | contact page map embed | ACTIVE |
| `google_maps_directions_url` | `site_settings` KV | root loader | footer/contact "Get directions" links | ACTIVE |
| `bn_number` (business registration) | `site_settings` KV | `business-settings.server.ts` | receipts (`receipt-document.ts` registrationNumber) | ACTIVE |
| `phone_lock_nigeria` | `site_settings` KV | checkout loader | `checkout.tsx` phone input `countryLocked` | ACTIVE |
| `delivery_fee` | `site_settings` KV | `checkout.server.ts` (key allowlist) | `checkout-quote.ts` → checkout delivery fee + SSR quote | ACTIVE — server-authoritative |
| `free_delivery_enabled` | `site_settings` KV | `checkout.server.ts` | `checkout-quote.ts` → free-delivery eligibility banner | ACTIVE — server-authoritative |
| `free_delivery_threshold` | `site_settings` KV | `checkout.server.ts` | `checkout-quote.ts` → "Add ₦X more to qualify" | ACTIVE — server-authoritative |
| `low_stock_alerts_enabled` | `site_settings` KV | `inventory-settings.server.ts` | inventory low-stock alert pipeline | ACTIVE |
| `low_stock_threshold_default` | `site_settings` KV | `inventory-settings.server.ts` | default per-product low-stock threshold fallback | ACTIVE |
| `announcements` | `site_settings` KV (structured) | root loader → `siteSettings.announcements` | `site-header.tsx` announcement bar (enabled/rotation/dismiss) | ACTIVE |
| `announcement_rotation_interval` | `site_settings` KV | `site-settings.ts` `getRotationInterval` | header rotation timer | ACTIVE |
| `ga_enabled` / `ga_measurement_id` | `site_settings` KV | `adminGetSiteSettings` | analytics gate — loaded only when both truthy | ACTIVE (owner-gated) |
| Social links (Facebook, TikTok, Telegram, WhatsApp community) | `social_links` table (separate, active-only) | `getPublicSocialLinks` | footer social icons (`site-footer.tsx`) | ACTIVE |

## Verification notes

- **No fake-functional controls found.** Every key read by the settings admin
  form is consumed as listed above.
- Checkout delivery settings are consumed **server-side** by
  `checkout-quote.ts`/`checkout.server.ts`; the client never trusts a cached
  display value for pricing (checkout authority preserved).
- `ga_enabled` requires an explicit owner turn-on; absent either value,
  no analytics script is injected (privacy-safe default).
- WhatsApp remains customer-initiated `wa.me` deep links only — no API, no
  automatic messaging (locked architecture).
- Low-stock settings feed the inventory alert pipeline; the alert *send* path
  is admin Telegram/notification, not public.
