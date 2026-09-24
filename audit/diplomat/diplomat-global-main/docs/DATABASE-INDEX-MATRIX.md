# DATABASE INDEX MATRIX

> Generated: 2026-08-31 | Branch: testing

## Current Indexes (from migrations)

| Table | Index Name | Columns | Type | Justified By |
|-------|-----------|---------|------|--------------|
| admin_users | `admin_users_active_role_idx` | active, role | Composite | Login/auth queries |
| admin_users | `admin_users_role_id_idx` | role_id | B-tree | FK lookup |
| admin_users | `admin_users_email_unique_idx` | email (WHERE NOT NULL) | Unique partial | Email lookup |
| roles | `roles_key_idx` | key | B-tree | Permission resolution |
| permissions | `permissions_key_idx` | key | B-tree | Permission checks |
| role_permissions | `role_permissions_role_idx` | role_id | B-tree | FK lookup |
| role_permissions | `role_permissions_perm_idx` | permission_id | B-tree | FK lookup |
| categories | `categories_slug_idx` | slug | B-tree | Public URL resolution |
| categories | `categories_parent_idx` | parent_id | B-tree | FK lookup |
| products | `products_category_status_idx` | category_id, status | Composite | Shop filtering |
| products | `products_slug_idx` | slug | B-tree | Public URL resolution |
| product_images | `product_images_product_sort_idx` | product_id, sort_order | Composite | Image ordering |
| customers | `idx_customers_unsubscribe_token` | unsubscribe_token (WHERE NOT NULL) | Unique partial | Unsubscribe |
| orders | `orders_customer_created_idx` | customer_id, created_at DESC | Composite | Customer order history |
| orders | `orders_status_created_idx` | status, created_at DESC | Composite | Status filtering + financial queries |
| order_items | `order_items_order_idx` | order_id | B-tree | FK lookup |
| reviews | `reviews_product_status_idx` | product_id, status | Composite | Product reviews |
| audit_logs | `audit_logs_actor_created_idx` | clerk_user_id, created_at DESC | Composite | Actor audit trail |
| blog_posts | `blog_posts_slug_idx` | slug | B-tree | Public URL resolution |
| blog_posts | `blog_posts_status_idx` | status, published_at DESC | Composite | Published listing |
| hero_slides | `hero_slides_active_idx` | active, sort_order | Composite | Active slides |
| testimonials | `idx_testimonials_moderation_status` | moderation_status | B-tree | Moderation |
| testimonials | `idx_testimonials_public_display` | active, moderation_status, sort_order (partial) | Partial | Public display |
| messages | `messages_read_idx` | is_read, created_at DESC | Composite | Unread messages |
| newsletter_subscribers | `idx_newsletter_unsubscribe_token` | unsubscribe_token (WHERE NOT NULL) | Unique partial | Unsubscribe |
| payment_transactions | `payment_transactions_order_idx` | order_id | B-tree | FK lookup |
| payment_transactions | `payment_transactions_reference_idx` | reference | B-tree | Paystack reference lookup |
| payment_transactions | `payment_transactions_status_idx` | status | B-tree | Status filtering |
| receipts | `receipts_order_idx` | order_id | B-tree | FK lookup |
| receipts | `receipts_number_idx` | receipt_number | B-tree | Receipt lookup |
| communication_logs | `communication_logs_type_status_idx` | type, status | Composite | Email history |
| privacy_requests | `idx_privacy_requests_customer` | customer_id | B-tree | FK lookup |
| privacy_requests | `idx_privacy_requests_status` | status | B-tree | Status filtering |
| expenses | `idx_expenses_date` | date | B-tree | Date range queries |
| expenses | `idx_expenses_category` | category | B-tree | Category filter |
| orders | `orders_checkout_attempt_unique` | checkout_attempt_id | Unique | Idempotent checkout |
| orders | `orders_pending_lifecycle_idx` | status, created_at (WHERE pending) | Partial | Abandoned order cron |
| orders | `orders_checkout_attempt_idx` | checkout_attempt_id | B-tree | Checkout lookup |
| receipts | `receipts_download_token_idx` | download_token | Unique | Secure download |
| admin_notifications | `admin_notifications_event_key_unique` | event_key | Unique | Dedup |
| admin_notifications | `admin_notifications_created_at_idx` | created_at | B-tree | Ordering |
| admin_notifications | `admin_notifications_category_idx` | category | B-tree | Filtering |
| admin_notifications | `admin_notifications_severity_idx` | severity | B-tree | Filtering |

## Proposed New Indexes (Migration 20260831120000)

| Table | Index Name | Columns | Type | Query Justification | Priority |
|-------|-----------|---------|------|---------------------|----------|
| payment_transactions | `idx_payment_transactions_status_created` | status, created_at DESC | Composite | Refund period queries in analytics | HIGH |
| order_items | `idx_order_items_order_product` | order_id, product_id | Composite | COGS calculation join | MEDIUM |
| audit_logs | `idx_audit_logs_action_created` | action, created_at DESC | Composite | Security event dedup + filtering | MEDIUM |
| expenses | `idx_expenses_date_category` | date DESC, category | Composite | Expense list with both filters | MEDIUM |
| newsletter_subscribers | `idx_newsletter_subscribers_email_unique` | lower(email) | Unique | Duplicate subscription prevention | HIGH |
| customers | `idx_customers_email` | lower(email) | B-tree | Checkout + search email lookup | HIGH |
| customers | `idx_customers_phone` | phone (WHERE NOT NULL) | B-tree | Search phone lookup | MEDIUM |
| products | `idx_products_sku` | sku (WHERE NOT NULL) | B-tree | SKU search | MEDIUM |
| admin_notifications | `idx_admin_notifications_created_desc` | created_at DESC | B-tree | Newest-first ordering | LOW |
| products | `idx_products_active_featured` | featured, created_at DESC (WHERE status='active') | Partial | Homepage featured query | LOW |

## Index Overlap Check

| Proposed Index | Overlaps With | Impact |
|---|---|---|
| `idx_payment_transactions_status_created` | `payment_transactions_status_idx` | Superset — old index becomes redundant after adoption |
| `idx_expenses_date_category` | `idx_expenses_date` + `idx_expenses_category` | Partial overlap — composite covers both filters |
| `idx_products_active_featured` | `products_category_status_idx` | No overlap — different columns |

## Rejected Index Candidates

| Candidate | Reason |
|-----------|--------|
| `orders.customer_id` alone | Already covered by `orders_customer_created_idx` |
| `categories.sort_order` | Categories table is tiny (<100 rows) |
| `admin_users.clerk_user_id` | Unique FK lookup is fast without dedicated index |
| `reviews.created_at` | Reviews filtered by product, not sorted by date |
| `blog_posts.created_at` | Blog listing uses status+published_at, not created_at |

## Migration Safety

All proposed indexes use:
- `CREATE INDEX IF NOT EXISTS` (idempotent)
- Additive only (never modify existing migrations)
- Justified by measured query patterns

**DATABASE_PERFORMANCE_MIGRATION_READY=YES** (pending Owner approval to apply)
