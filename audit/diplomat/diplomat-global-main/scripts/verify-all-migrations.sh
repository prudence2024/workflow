#!/bin/bash
# Verify all 13 historical migrations against live Supabase schema
# Uses stdin piping to npx supabase db query --linked

cd /c/Users/User/desktop/diplomat-global
SUPA="npx supabase db query --linked"
GREP="grep -v 'Initialising\|A new version\|recommend'"

run_q() {
  local label="$1"
  local sql="$2"
  echo "--- $label ---"
  echo "$sql" | $SUPA 2>&1 | $GREP
  echo ""
}

echo "========================================"
echo "MIGRATION RECONCILIATION — LIVE SCHEMA"
echo "========================================"
echo ""

# M1: 20260725_admin_users
echo "=== M1: 20260725_admin_users ==="
run_q "admin_users columns" "SELECT column_name, is_nullable, data_type, column_default FROM information_schema.columns WHERE table_name='admin_users' AND table_schema='public' ORDER BY ordinal_position"
run_q "admin_users constraints" "SELECT conname, contype::text, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'admin_users'::regclass ORDER BY contype, conname"
run_q "admin_users indexes" "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='admin_users' AND schemaname='public'"
run_q "admin_users RLS" "SELECT tablename, relrowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid = relnamespace WHERE relname = 'admin_users' AND nspname = 'public'"

# M2: 20260725_commerce_schema
echo "=== M2: 20260725_commerce_schema ==="
run_q "commerce tables exist" "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('categories','products','product_images','inventory','customers','coupons','orders','order_items','reviews','audit_logs') ORDER BY tablename"
run_q "orders columns" "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='orders' AND table_schema='public' ORDER BY ordinal_position"
run_q "products columns" "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='products' AND table_schema='public' ORDER BY ordinal_position"
run_q "set_updated_at exists" "SELECT proname FROM pg_proc WHERE proname = 'set_updated_at'"

# M3: 20260820_full_schema
echo "=== M3: 20260820_full_schema ==="
run_q "full_schema tables" "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('blog_posts','hero_slides','testimonials','messages','newsletter_subscribers','site_pages','site_settings','social_links','payment_transactions','receipts','communication_logs','integration_configs') ORDER BY tablename"
run_q "payment_transactions columns" "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='payment_transactions' AND table_schema='public' ORDER BY ordinal_position"
run_q "receipts columns" "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='receipts' AND table_schema='public' ORDER BY ordinal_position"
run_q "exec_sql exists" "SELECT proname FROM pg_proc WHERE proname = 'exec_sql'"

# M4: 20260821_expand_roles
echo "=== M4: 20260821_expand_roles ==="
run_q "admin_users CHECK constraint" "SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'admin_users'::regclass AND contype = 'c'"

# M5: 20260821_rbac_fix_access
echo "=== M5: 20260821_rbac_fix_access ==="
run_q "RBAC grants" "SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE table_name IN ('roles','permissions','role_permissions') AND table_schema='public' ORDER BY table_name, grantee"
run_q "RBAC RLS policies" "SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('roles','permissions','role_permissions') ORDER BY tablename, policyname"

# M6: 20260821_rbac_system
echo "=== M6: 20260821_rbac_system ==="
run_q "roles seed data" "SELECT key, name, is_system FROM roles ORDER BY key"
run_q "permissions count" "SELECT count(*) as perm_count FROM permissions"
run_q "role_permissions per role" "SELECT r.key as role_key, count(*) as perm_count FROM role_permissions rp JOIN roles r ON r.id = rp.role_id GROUP BY r.key ORDER BY r.key"
run_q "RBAC indexes" "SELECT indexname FROM pg_indexes WHERE tablename IN ('roles','permissions','role_permissions') AND schemaname='public' ORDER BY indexname"
run_q "admin_users.role_id" "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='admin_users' AND column_name='role_id' AND table_schema='public'"

# M7: 20260822_deprecate_legacy_admin_role
echo "=== M7: 20260822_deprecate_legacy_admin_role ==="
run_q "role column defaults/nullable" "SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name='admin_users' AND column_name='role' AND table_schema='public'"
run_q "admin_users no role CHECK" "SELECT conname FROM pg_constraint WHERE conrelid = 'admin_users'::regclass AND contype = 'c'"

# M8: 20260823_add_admin_avatar_url
echo "=== M8: 20260823_add_admin_avatar_url ==="
run_q "avatar_url column" "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='admin_users' AND column_name='avatar_url' AND table_schema='public'"

# M9: 20260823_add_admin_email_column
echo "=== M9: 20260823_add_admin_email_column ==="
run_q "email column" "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='admin_users' AND column_name='email' AND table_schema='public'"
run_q "email index" "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='admin_users' AND schemaname='public' AND indexname LIKE '%email%'"

# M10: 20260824_admin_notification_reads
echo "=== M10: 20260824_admin_notification_reads ==="
run_q "notification_reads columns" "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='admin_notification_reads' AND table_schema='public' ORDER BY ordinal_position"
run_q "notification_reads constraints" "SELECT conname, contype::text, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'admin_notification_reads'::regclass ORDER BY contype, conname"
run_q "notification_reads grants" "SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='admin_notification_reads' AND table_schema='public' ORDER BY grantee"
run_q "notification_reads RLS policies" "SELECT policyname FROM pg_policies WHERE tablename='admin_notification_reads'"

# M11: 20260824_fix_staff_invitation_model
echo "=== M11: 20260824_fix_staff_invitation_model ==="
run_q "key columns nullability" "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='admin_users' AND column_name IN ('clerk_user_id','email','avatar_url') AND table_schema='public'"
run_q "email+pending indexes" "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='admin_users' AND schemaname='public' AND (indexname LIKE '%email%' OR indexname LIKE '%pending%') ORDER BY indexname"

# M12: 20260825_marketing_suppression
echo "=== M12: 20260825_marketing_suppression ==="
run_q "marketing_suppression columns" "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='marketing_suppression' AND table_schema='public' ORDER BY ordinal_position"
run_q "marketing_suppression constraints" "SELECT conname, contype::text, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'marketing_suppression'::regclass ORDER BY contype"
run_q "customers.unsubscribe_token" "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='customers' AND column_name='unsubscribe_token' AND table_schema='public'"
run_q "newsletter.unsubscribe_token" "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='newsletter_subscribers' AND column_name='unsubscribe_token' AND table_schema='public'"
run_q "marketing suppression triggers" "SELECT triggername FROM pg_trigger WHERE tgrelid = 'marketing_suppression'::regclass AND NOT tgisinternal"
run_q "marketing suppression RLS" "SELECT tablename, relrowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid = relnamespace WHERE relname = 'marketing_suppression' AND nspname = 'public'"
run_q "customers columns (verify all)" "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='customers' AND table_schema='public' ORDER BY ordinal_position"

# M13: 20260825_testimonial_public_submission
echo "=== M13: 20260825_testimonial_public_submission ==="
run_q "testimonials columns" "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='testimonials' AND table_schema='public' ORDER BY ordinal_position"
run_q "testimonials CHECK" "SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'testimonials'::regclass AND contype = 'c'"
run_q "testimonials indexes" "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='testimonials' AND schemaname='public' ORDER BY indexname"

# M14: 20260826_checkout_hardening (VERIFY NOT YET APPLIED)
echo "=== M14: 20260826_checkout_hardening (NOT YET APPLIED) ==="
run_q "checkout_attempt_id absent" "SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name='checkout_attempt_id' AND table_schema='public'"
run_q "checkout indexes absent" "SELECT indexname FROM pg_indexes WHERE tablename='orders' AND schemaname='public' AND indexname LIKE '%checkout%'"
run_q "orders CHECK constraints" "SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'orders'::regclass AND contype = 'c'"
run_q "receipts UNIQUE constraints" "SELECT conname, contype::text FROM pg_constraint WHERE conrelid = 'receipts'::regclass AND contype = 'u'"
run_q "order statuses" "SELECT status, count(*) FROM orders GROUP BY status ORDER BY status"
run_q "receipt order_ids" "SELECT order_id, count(*) as cnt FROM receipts WHERE order_id IS NOT NULL GROUP BY order_id HAVING count(*) > 1"
run_q "orders indexes" "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='orders' AND schemaname='public' ORDER BY indexname"
run_q "receipts indexes" "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='receipts' AND schemaname='public' ORDER BY indexname"
