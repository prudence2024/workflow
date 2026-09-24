-- Performance Index Migration — Additive Only
-- Created: 2026-08-31
-- Based on: query pattern analysis of admin server functions
--原则: Every index must be justified by a real query pattern.

-- ══════════════════════════════════════════════════════════════
-- 1. payment_transactions: status + created_at
-- Used by: adminGetSalesAnalytics (refund period queries)
-- Query: .eq("status", "refunded").gte("created_at", start).lte("created_at", end)
-- Existing: payment_transactions_status_idx (single column)
-- This composite index covers the full WHERE clause.
-- ══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status_created
  ON public.payment_transactions (status, created_at DESC);

-- ══════════════════════════════════════════════════════════════
-- 2. order_items(order_id, product_id) — REMOVED
-- Existing order_items_order_idx(order_id) covers the FK join.
-- The COGS query joins via order_items!order_id and product_id adds
-- marginal covering benefit on a small table. NOT JUSTIFIED.
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- 3. audit_logs: action + created_at
-- Used by: adminListAuditLogs, security event dedup queries
-- Query: .eq("action", "admin_session_started").filter("metadata->>session_id", ...)
-- Existing: audit_logs_actor_created_idx (clerk_user_id, created_at)
-- This covers the action-based filtering pattern.
-- ══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
  ON public.audit_logs (action, created_at DESC);

-- ══════════════════════════════════════════════════════════════
-- 4. expenses: category + date DESC (equality then range)
-- Used by: adminListExpenses with category filter + date range
-- Query: .eq("category", ...).gte("date", ...).lte("date", ...)
-- Existing: idx_expenses_date (single), idx_expenses_category (single)
-- Composite (category, date DESC) covers equality+range+ORDER.
-- ══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_expenses_category_date
  ON public.expenses (category, date DESC);

-- ══════════════════════════════════════════════════════════════
-- 5. newsletter_subscribers: email
-- SKIPPED: UNIQUE constraint already creates index in baseline migration
-- (line 200: email text NOT NULL UNIQUE)
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- 6. customers email — REMOVED
-- The UNIQUE constraint on email already creates a B-tree index.
-- Application uses .eq("email", normalizedEmail) — direct equality.
-- lower(email) expression index is NOT needed for this query pattern.
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- 7. customers phone — REMOVED
-- Search uses .ilike("phone", like) with %term% leading wildcard.
-- B-tree index is ineffective for leading-wildcard ILIKE.
-- No exact-match phone queries exist in the application.
-- Dataset too small to justify pg_trgm extension. NOT JUSTIFIED.
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- 8. products: SKU lookup
-- SKIPPED: UNIQUE constraint already creates index in baseline migration
-- (line 141: sku text NOT NULL UNIQUE)
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- 9. notifications: newest-first
-- SKIPPED: admin_notifications_created_at_idx (created_at) already exists in
-- admin_notifications migration. Only difference is ASC vs DESC direction,
-- which PostgreSQL can use index scan + reverse. No new index needed.
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- 10. products: active + featured (for homepage featured query)
-- Used by: homepage featured products loader
-- Query: .eq("status", "active").eq("featured", true)
-- Existing: products_category_status_idx (category_id, status)
-- This partial index covers the active+featured filter.
-- ══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_products_active_featured
  ON public.products (featured, created_at DESC)
  WHERE status = 'active';
