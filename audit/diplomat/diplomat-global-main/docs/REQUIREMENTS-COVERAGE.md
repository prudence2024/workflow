# Requirements Coverage — Diplomat Global

**Last Updated:** 2026-08-28
**Branch:** testing
**HEAD:** e40e8f2

## Coverage Summary

| Status | Count |
|---|---|
| ✅ IMPLEMENTED | 58 |
| ⏳ OWNER ACTION | 7 |
| 🔄 PARTIAL | 0 |
| ❌ MISSING | 0 |

**MISSING = 0**
**UNEXPLAINED PARTIAL = 0**

---

## Payment System

| Requirement | Status | Evidence |
|---|---|---|
| Checkout initialization | ✅ | src/lib/checkout.server.ts |
| callback_url preview-aware | ✅ | VERCEL_URL for preview, VITE_SITE_URL for production |
| Webhook HMAC verification | ✅ | x-paystack-signature + createHmac |
| Payment finalization idempotency | ✅ | Already-processed check, receipt token returned |
| Retry reference lookup | ✅ | Searches payment_transactions |
| Order status lifecycle | ✅ | pending → paid → fulfilled |
| Inventory decrement | ✅ | Exactly-once, non-negative constraint |
| Coupon usage increment | ✅ | Exactly-once, max_uses respected |
| Receipt generation | ✅ | Opaque download_token, branded HTML |
| Customer branded email | ✅ | Professional HTML with logo, SKU, amounts |
| Admin notification | ✅ | order_created event |
| Telegram notification | ✅ | Payment confirmed notification |
| Cart clearing | ✅ | After server-verified payment |
| Success page UX | ✅ | Loading/verified/failure states, "do NOT pay twice" |
| Callback page retry | ✅ | Retry logic, error handling |
| Payment failure handling | ✅ | No inventory/coupon change on failure |
| Cancel handling | ✅ | No side effects on cancellation |
| Checkout no-cache | ✅ | Cache-Control: no-store |
| CSV injection protection | ✅ | escapeCsvCell() |
| Honeypot anti-spam | ✅ | Hidden field on contact form |

## Order Management

| Requirement | Status | Evidence |
|---|---|---|
| Order detail page | ✅ | /dashboard/orders/$id |
| SKU in order items | ✅ | Snapshot: product_id, sku, name, unit_price, quantity |
| Payment history | ✅ | payment_transactions linked |
| Receipt link | ✅ | download_token in order detail |
| Clickable order rows | ✅ | Navigate to detail page |

## Transaction Management

| Requirement | Status | Evidence |
|---|---|---|
| Transaction list | ✅ | /dashboard/transactions |
| Transaction detail | ✅ | /dashboard/transactions/$id |
| Clickable transaction rows | ✅ | Navigate to detail page |
| Reference + status | ✅ | Paystack reference, status display |

## Customer Management

| Requirement | Status | Evidence |
|---|---|---|
| Customer list | ✅ | /dashboard/customers |
| Customer detail | ✅ | /dashboard/customers/$id |
| Order history | ✅ | Linked orders in detail |
| Total spend | ✅ | Aggregated in detail |
| Clickable customer rows | ✅ | Navigate to detail page |

## SKU System

| Requirement | Status | Evidence |
|---|---|---|
| SKU as business identifier | ✅ | products.sku field |
| SKU uniqueness | ✅ | DB constraint |
| SKU in order items | ✅ | Historical snapshot |
| SKU on receipt | ✅ | receipt line items |
| SKU in admin views | ✅ | Product, order, transaction, customer detail |
| Product search by SKU | ✅ | Server-side search |

## Receipt

| Requirement | Status | Evidence |
|---|---|---|
| Diplomat branding | ✅ | BN 3049329, address, phone, email |
| Receipt number | ✅ | Generated receipt_number |
| Order + payment refs | ✅ | order_number, paystack_reference |
| Customer details | ✅ | Name, address, phone, email |
| Line items with SKU | ✅ | Description, SKU, qty, rate, amount |
| Subtotal/discount/delivery | ✅ | Calculated fields |
| Amount in words | ✅ | numberToWords() |
| PAID status | ✅ | Displayed on receipt |
| Print support | ✅ | CSS @media print |
| Download via opaque token | ✅ | /api/receipt/:token |
| Token not leaked in APIs | ✅ | Token only in receipt-specific endpoints |

## Upload Security

| Requirement | Status | Evidence |
|---|---|---|
| Client MIME allowlist | ✅ | JPEG/PNG/WebP/AVIF |
| Client size limit | ✅ | 10MB |
| Server upload validation | ✅ | resource_type=image in signed upload |
| Auth required | ✅ | requirePermission check |
| Safe Cloudinary folder | ✅ | diplomat-global/ prefix |

## RBAC / Permissions

| Requirement | Status | Evidence |
|---|---|---|
| 199 authorization checks | ✅ | requirePermission in server functions |
| requirePermission() | ✅ | Permission-based access control |
| requireOwner() | ✅ | Owner-only staff management |
| Permissions page | ✅ | DB-driven, grouped by module |
| Role permission editor | ✅ | Checkbox UI, save/cancel |
| Sidebar permission filtering | ✅ | Admins don't see unauthorized pages |
| Owner-only staff invite | ✅ | requireOwner for invite/role/deactivate/delete |
| Last Owner protection | ✅ | Cannot remove last Owner |
| Login audit | ✅ | admin_session_started event |
| Logout audit | ✅ | admin_session_ended event |

## Privacy / Legal

| Requirement | Status | Evidence |
|---|---|---|
| Privacy request workflow | ✅ | Migration + server functions (REQUESTED→COMPLETED) |
| Customer data erasure | ✅ | Anonymization on completion |
| Privacy Policy page | ✅ | /privacy route |
| Terms & Conditions | ✅ | /terms route |
| Warranty policy | ✅ | /warranty route |
| Returns policy | ✅ | /returns route |
| Refunds policy | ✅ | /refunds route |
| Legal review disclaimer | ✅ | "Legal review recommended" noted |

## SEO / Visibility

| Requirement | Status | Evidence |
|---|---|---|
| robots.txt | ✅ | With AI crawler rules |
| llms.txt | ✅ | AI discoverability |
| Sitemap | ✅ | /sitemap.xml route |
| Meta tags | ✅ | Title, description, OG, Twitter |
| Dashboard blocked | ✅ | Disallow: /dashboard |
| Canonical URLs | ✅ | Via TanStack Router head |

## Performance

| Requirement | Status | Evidence |
|---|---|---|
| OptimizedImage priority | ✅ | Priority images skip skeleton |
| Hero carousel optimization | ✅ | Single active slide loads |
| Featured products eager | ✅ | First 4 load eagerly |
| Cloudinary f_auto/q_auto | ✅ | Responsive delivery |
| TSC clean | ✅ | EXIT 0 |
| Build passes | ✅ | EXIT 0, 21.54s |

## Security

| Requirement | Status | Evidence |
|---|---|---|
| No VITE_ server secrets | ✅ | All VITE_ vars are public identifiers |
| .gitignore protection | ✅ | .env, .freebuff, supabase/.temp |
| CSP header | ✅ | Content-Security-Policy |
| X-Frame-Options | ✅ | DENY |
| Permissions-Policy | ✅ | Camera, microphone, geolocation denied |
| X-Content-Type-Options | ✅ | nosniff |
| Webhook HMAC | ✅ | x-paystack-signature verification |
| Cross-project guard | ✅ | Skill + .gitignore protection |

## Cross-Project Isolation

| Requirement | Status | Evidence |
|---|---|---|
| Diplomat/LittleReads isolated | ✅ | Audit + cleanup completed |
| LittleReads Supabase link removed | ✅ | .temp/ deleted |
| Skytech .env untracked | ✅ | Removed from git |
| Guard skill created | ✅ | .agents/skills/cross-project-guard/ |

## Prudence Codex Review

| Requirement | Status | Evidence |
|---|---|---|
| Full repository inventory | ✅ | 461 files, 26 areas, exact classification |
| Source verification | ✅ | Local dc4e978 = GitHub dc4e978 |
| Folder-by-folder classification | ✅ | 12 A, 7 B, 3 C, 4 D |
| Knowledge applied | ✅ | 12 changes from Prudence |
| Knowledge rejected | ✅ | 11 items with documented reasons |
| Source-state document | ✅ | docs/PRUDENCE-CODEX-SOURCE-STATE.md |

## Owner-Only Actions (Not Applicable to Freebuff)

| # | Action | Reason |
|---|---|---|
| 1 | Apply privacy_requests migration | Supabase Dashboard SQL Editor required |
| 2 | Enable Vercel Automation Bypass | Dashboard login required |
| 3 | Configure Paystack TEST webhook | Dashboard login required |
| 4 | Perform Paystack TEST checkout | Human browser action |
| 5 | Verify branded customer email | Check actual inbox |
| 6 | Resend domain verification | DNS account required |
| 7 | Approve testing → main merge | Owner decision |
