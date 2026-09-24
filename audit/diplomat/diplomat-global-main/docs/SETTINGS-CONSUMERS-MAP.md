# SETTINGS CONSUMERS MAP

Every Admin setting mapped to its DB key, save path, and public/admin consumer.

Last verified: 2026-08-31

---

## Active Settings

| # | Admin Label | DB Key | Type | Public Consumer | Admin Consumer |
|---|------------|--------|------|----------------|----------------|
| 1 | Company Name | `company_name` | text | Footer copyright, Receipt headers, Email templates | Settings page display |
| 2 | Tagline | `tagline` | text | Product search index (DB-only) | Settings page display |
| 3 | Support Email | `support_email` | email | Footer contact, Contact page, Receipt headers | Settings page display |
| 4 | Phone | `phone` | text | Footer contact, Contact page, Receipt headers | Settings page display |
| 5 | WhatsApp URL | `whatsapp_url` | url | Footer contact (optional), Order success page | Settings page display |
| 6 | Location | `location` / `company_location` | text | Footer address, Contact page address, Receipt headers | Settings page display |
| 7 | Google Maps Directions URL | `google_maps_directions_url` | url | Contact page "Open in Google Maps" link | Settings page display |
| 8 | Google Maps Embed URL | `google_maps_embed_url` | url | **NOT CURRENTLY CONSUMED** (no embed on Contact page) | Settings page display |
| 9 | Delivery Fee | `delivery_fee` | number | Checkout: fetched from DB, applied to order total | Settings page display |
| 10 | Phone Lock Nigeria | `phone_lock_nigeria` | boolean | Checkout phone input, Contact phone input, Request phone input, Server-side validation | Settings page toggle |
| 11 | Announcements | `announcements` | JSON array | Site header: enabled announcements rotate at configured interval | Settings page: CRUD, enable/disable, reorder |
| 12 | Announcement Rotation Interval | `announcement_rotation_interval` | number (seconds) | Site header: rotation timer | Settings page display |

---

## Dead / Unused Settings

| Setting | Status | Recommendation |
|---------|--------|----------------|
| `google_maps_embed_url` | No consumer found — Contact page uses compact card, not iframe embed | Remove or wire to an embed |
| `tagline` | Only used in product search index, not displayed publicly | Consider displaying in site header or remove |

---

## Settings Without Admin Controls

| Consumer | DB Key | Admin Control |
|----------|--------|---------------|
| Business registration number | N/A | No setting exists — owner mentioned wanting one |

---

## Consumer Details

### 1. company_name
- **Footer**: `© 2026 {company_name}. All rights reserved.`
- **Receipt**: `<h1>{company_name}</h1>` in PDF/HTML receipts
- **Email**: Used in order confirmation email templates
- **Fallback**: `"Diplomat Global Tech-Solutions"`

### 2. tagline
- **Product search**: Indexed for `name.ilike, sku.ilike, tagline.ilike` search
- **Product card**: Displayed as subtitle on product cards
- **Fallback**: Empty string (not displayed if blank)

### 3. support_email
- **Footer**: Clickable email link in Contact column
- **Contact page**: Displayed as primary email contact
- **Receipt**: Business email in receipt header
- **Fallback**: `"support@diplomatglobal.com.ng"`

### 4. phone
- **Footer**: Clickable phone link in Contact column
- **Contact page**: Displayed as primary phone contact
- **Receipt**: Business phone in receipt header
- **Fallback**: `"+234 803 575 1338"`

### 5. whatsapp_url
- **Footer**: Optional "Chat on WhatsApp" link (only shown if set)
- **Order success**: WhatsApp support link after purchase
- **Fallback**: Not shown if empty

### 6. location / company_location
- **Footer**: Address in Contact column (with MapPin icon)
- **Contact page**: Address displayed with map card
- **Receipt**: Business address in receipt header
- **Fallback**: `BUSINESS_ADDRESS` constant (Lagos, Nigeria)

### 7. google_maps_directions_url
- **Contact page**: "Open in Google Maps" link below address card
- **Fallback**: Not shown if empty

### 8. google_maps_embed_url
- **Status**: NO CONSUMER FOUND
- **Contact page**: Uses compact card layout (no iframe embed)
- **Recommendation**: Remove from settings or add embed

### 9. delivery_fee
- **Checkout server**: `SELECT value FROM site_settings WHERE key = 'delivery_fee'`
- **Applied to**: Order total calculation
- **Default**: `"7500"` (₦7,500)

### 10. phone_lock_nigeria
- **Checkout**: Phone input restricted to Nigeria numbers
- **Contact**: Phone input restricted to Nigeria numbers
- **Request**: Phone input restricted to Nigeria numbers
- **Server validation**: `validatePhoneWithLock()` rejects non-Nigerian numbers
- **Default**: `"false"`

### 11. announcements
- **Site header**: Rotating announcement banner at top of every page
- **Behavior**: Only enabled announcements shown; rotates at configured interval
- **Admin**: Full CRUD with enable/disable per announcement
- **Zero state**: No banner shown
- **Fallback**: Hardcoded `DEFAULT_ANNOUNCEMENTS` if DB unavailable

### 12. announcement_rotation_interval
- **Site header**: Seconds between announcement rotation
- **Default**: 8 seconds
- **Range**: Configurable in settings page
