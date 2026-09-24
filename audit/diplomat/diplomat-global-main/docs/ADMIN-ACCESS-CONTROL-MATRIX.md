# ADMIN ACCESS CONTROL MATRIX

> Updated: 2026-08-31 | Branch: testing | HEAD: latest

## Summary

- **37 Admin routes** (dashboard pages)
- **125 total server functions** (TanStack serverFn)
- **4 API routes** (webhooks + cron)
- **All admin server functions** enforce authentication + RBAC server-side
- **3 audit log writers** removed/hardened this session (security fix)
- **Global search** uses per-resource permission filtering

---

## SERVER FUNCTION CLASSIFICATION (Mutually Exclusive)

### AUTHENTICATED + PERMISSION (96 functions)

These require `requirePermission(key)` — Clerk session → admin_users.active → role → permission.

| Permission | Functions |
|---|---|
| `orders.view` | `adminListOrders`, `adminGetOrderDetail` |
| `orders.update` | `adminUpdateOrderStatus` |
| `customers.view` | `adminListCustomers`, `adminGetCustomerDetail` |
| `customers.edit` | `adminUpdateCustomer` |
| `transactions.view` | `adminListTransactions`, `adminGetTransactionDetail` |
| `receipts.view` | `adminListReceipts`, `adminGetReceiptHTML`, `adminResendReceipt` |
| `messages.view` | `adminListMessages` |
| `messages.manage` | `adminMarkMessageRead`, `adminDeleteMessage` |
| `newsletter.manage` | `adminListSubscribers`, `adminDeleteSubscriber`, `adminUnsubscribeCustomer`, `adminResubscribeCustomer`, `adminGetUnsubscribeUrl` |
| `audit.view` | `adminListAuditLogs` |
| `audit.delete` | `adminDeleteAuditLogs`, `adminClearAuditLogsBefore` |
| `categories.manage` | `adminListCategoriesForDashboard`, `adminCreateCategory`, `adminUpdateCategory`, `adminDeleteCategory` |
| `blog.manage` | `adminListBlogPosts`, `adminCreateBlogPost`, `adminUpdateBlogPost`, `adminDeleteBlogPost`, `adminListMedia`, `adminDeleteMedia` |
| `hero.manage` | `adminListHeroSlides`, `adminCreateHeroSlide`, `adminUpdateHeroSlide`, `adminDeleteHeroSlide` |
| `reviews.manage` | `adminListTestimonials`, `adminCreateTestimonial`, `adminUpdateTestimonial`, `adminDeleteTestimonial` |
| `settings.manage` | `adminGetSiteSettings`, `adminUpdateSiteSettings`, `adminListSocialLinks`, `adminCreateSocialLink`, `adminUpdateSocialLink`, `adminDeleteSocialLink` |
| `inventory.manage` | `adminListInventory`, `adminUpdateInventory` |
| `coupons.manage` | `adminListCoupons`, `adminGenerateCouponCode`, `adminCreateCoupon`, `adminUpdateCoupon`, `adminDeleteCoupon` |
| `analytics.view` | `adminGetAnalyticsData`, `adminGetSalesAnalytics`, `adminGetDashboardFinancialSummary`, `adminGetDashboardStats` |
| `refunds.create` | `adminInitiateRefund` |
| `staff.view` | `adminListMembers` |
| `roles.manage` | `adminGetRoles`, `adminGetAllPermissions`, `adminListRoles`, `adminCreateRole`, `adminUpdateRole`, `adminDeleteRole` |
| `pages.manage` | `adminListSitePages`, `adminCreateSitePage`, `adminUpdateSitePage`, `adminDeleteSitePage` |
| `backup.create` | `adminExportData` |
| `integrations.view` | `adminGetIntegrationStatus`, `adminGetServiceStatus` |
| `integrations.manage` | `adminTestTelegram`, `adminTelegramDiagnose`, `adminRegisterTelegramWebhook`, `adminRegisterTelegramCommands`, `adminGetTelegramWebhookInfo` |
| `email.manage` | `adminSendEmail`, `adminListEmailHistory`, `adminImportContacts`, `adminListRecipients`, `adminSendMarketingEmail` |
| `expenses.view` | `adminListExpenses` |
| `expenses.create` | `adminCreateExpense` |
| `expenses.edit` | `adminUpdateExpense` |
| `expenses.delete` | `adminDeleteExpense` |
| `notifications.manage` | `adminListNotifications`, `adminMarkNotificationReadById`, `adminMarkAllNotificationsReadById`, `adminResolveNotification`, `adminListSecurityNotifications`, `adminMarkNotificationRead`, `adminMarkAllNotificationsRead` |

### AUTHENTICATED + OWNER (6 functions)

These require `requireOwner()` — Clerk session → admin_users.active → role.key === "owner".

| Function | Purpose |
|---|---|
| `adminUpdateMemberRole` | Change staff role |
| `adminToggleMemberActive` | Activate/deactivate staff |
| `adminDeleteMember` | Remove staff member |
| `adminInviteStaff` | Invite new staff |
| `adminListPrivacyRequests` | View privacy/GDPR requests |
| `adminUpdatePrivacyRequest` | Process privacy requests |

### INTERNAL-ONLY (2 functions)

These are write-only audit log writers used from client components. They require Clerk authentication (enforced server-side) and use strict event allowlists. NOT generally invokable by external callers.

| Function | Purpose | Controls |
|---|---|---|
| `adminLogSecurityEvent` | Log security boundary events (session start/end, access denial) | Requires Clerk auth, strict allowlist of 4 event types, 5s dedup, bounded metadata, server-derived timestamp/IP |

**Removed this session** (dead code with security risk):
- ~~`adminWriteAuditLog`~~ — Allowed arbitrary audit record injection. Zero callers.
- ~~`adminLogPermissionDenied`~~ — Allowed arbitrary permission-denied injection. Zero callers. Permission denials now logged internally via `requirePermission()` → `logAudit()`.

### PUBLIC INTENTIONALLY (15 functions)

These serve public-facing content. No authentication required.

| Function | Purpose |
|---|---|
| `getPublicProducts` | Product listing for shop |
| `getPublicProductsPaginated` | Paginated product listing |
| `getPublicProductBySlug` | Single product detail |
| `getRelatedProducts` | Related product suggestions |
| `getPublicCategories` | Category listing |
| `getPublicBlogPosts` | Blog post listing |
| `getPublicBlogPostBySlug` | Single blog post |
| `getPublicHeroSlides` | Homepage hero carousel |
| `getPublicTestimonials` | Testimonials display |
| `getPublicSocialLinks` | Social media links |
| `getPublicPageBySlug` | Static page content |
| `getPublicSiteSettings` | Public site settings |
| `getMyPermissions` | Current user's permissions |
| `publicUnsubscribe` | Newsletter unsubscribe (token-based) |
| `submitContactMessage` | Contact form submission |

### SELF-SERVICE (2 functions)

Authenticated admin functions that return the caller's own data.

| Function | Purpose |
|---|---|
| `adminGetMyPermissions` | Returns own permission list |
| `adminGetAvatarUrl` | Returns own avatar URL |

### WEBHOOK (3 routes)

External webhook endpoints with their own authentication mechanisms.

| Route | Auth Method |
|---|---|
| `/api/webhook.paystack` | HMAC SHA-512 signature verification |
| `/api/webhook.clerk` | Clerk webhook secret |
| `/api/webhook.telegram` | Chat ID authorization |

### CRON (1 route)

| Route | Auth Method |
|---|---|
| `/api/cron.abandoned-orders` | Vercel cron (IP-restricted) |

---

## GLOBAL SEARCH — PER-RESOURCE PERMISSIONS

The global search (`adminGlobalSearch`) does NOT use a single broad permission. Instead:

1. Requires `requireAdmin()` (any active admin can search)
2. Each entity type has its own permission gate:
   - Products: `products.view`
   - Orders: `orders.view`
   - Transactions: `payments.view`
   - Customers: `customers.view`
   - Blog: `products.view`
3. Unauthorized entity types return ZERO results (not empty counts)
4. No existence leakage for unauthorized resources

---

## AUDIT LOG SECURITY

| Aspect | Status |
|---|---|
| **Append-only** | ✅ RLS + service-role writes only. No browser INSERT/UPDATE/DELETE. |
| **Public writers removed** | ✅ `adminWriteAuditLog` and `adminLogPermissionDenied` deleted (dead code, security risk) |
| **Security event writer hardened** | ✅ `adminLogSecurityEvent`: auth required, strict 4-event allowlist, 5s dedup, bounded metadata, server-derived timestamp/IP |
| **Access** | `audit.view` permission required |
| **Delete** | `audit.delete` permission required (Owner-only in practice) |
| **Casual delete UI** | No — requires explicit confirmation + `audit.delete` permission |
| **Before/after diff** | Stored in `metadata` field as structured JSON |
| **Secret redaction** | No secrets logged |
| **Actor resolution** | Always from Clerk session → admin_users, never from browser |

---

## RATE LIMITING (Risk-Based)

| Policy | Limit | Window | Keyed By | Purpose |
|---|---|---|---|---|
| `contact` | 5 | 15 min | IP | Public contact form |
| `newsletter` | 3 | 1 hour | IP | Newsletter signup |
| `admin` | 120 | 1 min | Clerk user + IP | Normal admin reads |
| `admin-search` | 20 | 1 min | Clerk user + IP | Global search |
| `admin-mutation` | 30 | 1 min | Clerk user + IP | Create/update/delete |
| `admin-export` | 3 | 5 min | Clerk user + IP | Backup/export |
| `telegram` | 30 | 1 min | IP | Telegram webhook |

**Key design**: Rate limits key on `Clerk user ID + IP` to prevent shared-office/NAT from locking out all Admins.

---

## OWNER PROTECTION

| Protection | Implementation |
|---|---|
| Last owner cannot be deleted | `adminDeleteMember` checks role.key === "owner" + count |
| Last owner cannot be deactivated | `adminToggleMemberActive` checks same |
| Last owner cannot be demoted | `adminUpdateMemberRole` checks same |
| Staff management requires Owner | `requireOwner()` on all staff functions |
| Privacy requests require Owner | `requireOwner()` |
| Non-Owner cannot elevate itself | Role changes require Owner |

---

## CHANGES THIS SESSION

| Change | Detail |
|---|---|
| Removed `adminWriteAuditLog` | Dead code, allowed arbitrary audit injection |
| Removed `adminLogPermissionDenied` | Dead code, allowed arbitrary permission-denied injection |
| Hardened `adminLogSecurityEvent` | Added auth requirement, strict 4-event allowlist, 5s dedup, bounded metadata sanitization |
| Fixed global search auth | Changed from `analytics.view` (wrong) to `requireAdmin()` + per-resource permissions |
| Added `requirePermission("integrations.view")` to `adminGetServiceStatus` | Was leaking service configuration |
| Enhanced rate limiting | Risk-based policies instead of flat 60/min |
