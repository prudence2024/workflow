# DATABASE QUERY INVENTORY

> Generated: 2026-08-31 | Branch: testing

## Summary

| Operation | Count |
|-----------|-------|
| SELECT | 293 |
| INSERT | 51 |
| UPDATE | 127 |
| DELETE | 39 |
| UPSERT | 18 |
| RPC | 0 |
| **Total** | **528** |

## SELECT * Usage (27 instances)

| File | Table | Justified? |
|------|-------|:---:|
| `categories.server.ts:19` | categories | ✅ Small table, full row needed for admin UI |
| `categories.server.ts:26` | categories | ✅ Single row by ID |
| `content.server.ts:44` | blog_posts | ✅ Single row by ID for admin edit |
| `content.server.ts:88` | hero_slides | ✅ Small table, full row for admin |
| `content.server.ts:128` | testimonials | ✅ Small table, full row for admin |
| `content.server.ts:265` | social_links | ✅ Small table |
| `content.server.ts:298` | site_settings | ✅ Small KV table |
| `customers.server.ts:63` | customers | ✅ Single row detail |
| `payments.server.ts:91` | payment_transactions | ⚠️ Could limit columns |
| `products.server.ts:103` | products | ⚠️ Large table, could limit columns |
| `products.server.ts:193` | products | ⚠️ Large table, could limit columns |
| `server-fns.ts:803` | hero_slides | ✅ Small table |
| `server-fns.ts:894` | social_links | ✅ Small table |
| `server-fns.ts:921` | site_settings | ✅ Small KV table |
| `server-fns.ts:1546` | payment_transactions | ⚠️ Could limit columns |
| `server-fns.ts:2165` | roles | ✅ Small table |
| `server-fns.ts:2412` | export tables | ✅ Export needs full rows |
| `server-fns.ts:2853-2939` | public functions | ✅ Public content, small tables |
| `server-fns.ts:3207` | site_settings | ✅ Small KV table |
| `server-fns.ts:3226` | site_settings | ✅ Small KV table |
| `server-fns.ts:3346` | integration_configs | ✅ Small config table |
| `server-fns.ts:4919` | admin_notifications | ⚠️ Could limit columns |
| `checkout.server.ts:270` | products | ✅ Needs full row for cart |
| `telegram/commands/orders.server.ts:68` | orders | ⚠️ Could limit columns |

**Assessment**: Most `SELECT *` usages are on small config/content tables (justified). 5 instances on larger tables (products, orders, payment_transactions, notifications) could be optimized with explicit columns.

## High-Frequency Query Patterns

### Dashboard Financial Summary (`adminGetDashboardFinancialSummary`)
- **Queries per call**: 24 (4 per period × 6 periods)
- **Parallelism**: 6 batches of 4 parallel queries
- **Tables**: orders, order_items, payment_transactions, expenses
- **Optimization opportunity**: Could merge some period queries, but current parallel approach is reasonable for Vercel serverless

### Dashboard Stats (`adminGetDashboardStats`)
- **Queries per call**: 17
- **Parallelism**: All 17 in parallel via `Promise.all`
- **Tables**: orders, products, inventory, customers, reviews, messages, newsletter_subscribers

### Global Search (`adminGlobalSearch`)
- **Queries per call**: Up to 5 (one per entity type)
- **Parallelism**: Sequential (each needs permission check first)
- **Tables**: products, orders, payment_transactions, customers, blog_posts

## N+1 Query Analysis

| Location | Pattern | Status |
|----------|---------|--------|
| Product list → category name | Single query with join | ✅ No N+1 |
| Order list → customer name | Single query with relation | ✅ No N+1 |
| Order items → product details | Single query with relation | ✅ No N+1 |
| Dashboard stats → inventory | Single aggregate query | ✅ No N+1 |
| Financial summary → 6 periods | Parallel period queries | ✅ Acceptable parallelism |

**No N+1 patterns found** in current codebase. All entity relationships use Supabase relation selects or explicit joins.

## Duplicate Query Analysis

| Query Pattern | Found In | Deduplicated? |
|---|---|---|
| Site settings | `adminGetSiteSettings`, `getPublicSiteSettings` | ✅ Separate concerns (admin vs public) |
| Categories | `adminListCategoriesForDashboard`, `getPublicCategories` | ✅ Admin includes extra fields |
| Social links | `adminListSocialLinks`, `getPublicSocialLinks` | ✅ Admin vs public |
| Role permissions | `adminGetRoles`, permission checks | ⚠️ Could cache role lookup |
| Permission checks | `requirePermission` per serverFn | ✅ 5-min in-memory cache |

**Permission cache** (`_permCache` in admin-ops.server.ts) prevents redundant DB lookups within a 5-minute window.
