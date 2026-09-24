#!/usr/bin/env node
// Verify all 13 historical migrations against live Supabase schema
// Uses exec_sql RPC or direct pg queries via Supabase CLI

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

function query(sql) {
  // Write to temp file to avoid shell escaping issues
  const tmpFile = '/tmp/sb_verify_query.sql';
  // Escape single quotes for the shell
  const escaped = sql.replace(/'/g, "'\\''");
  try {
    const result = execSync(
      `cd /c/Users/User/desktop/diplomat-global && npx supabase db query --linked "${escaped}" 2>&1`,
      { encoding: 'utf8', timeout: 30000 }
    );
    // Remove CLI noise
    return result
      .split('\n')
      .filter(l => !l.includes('Initialising') && !l.includes('A new version') && !l.includes('recommend'))
      .join('\n');
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

console.log('========================================');
console.log('MIGRATION RECONCILIATION — LIVE SCHEMA');
console.log('========================================\n');

// ============================================================
// MIGRATION 1: 20260725_admin_users
// ============================================================
console.log('=== 1. 20260725_admin_users ===');
console.log('EXPECTED: admin_users table with id, clerk_user_id(text,NOT NULL,UNIQUE), role(text,NOT NULL,default admin), active, created_at, updated_at');
console.log('         CHECK length 8-255 on clerk_user_id, index on (active,role), RLS enabled, REVOKE anon/authenticated');

const m1 = query("SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name='admin_users' AND table_schema='public' ORDER BY ordinal_position");
console.log(m1);
const m1c = query("SELECT conname, contype::text, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'admin_users'::regclass ORDER BY contype, conname");
console.log(m1c);
const m1i = query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename='admin_users' AND schemaname='public'");
console.log(m1i);

console.log('NOTE: Migration 1 was superseded by later migrations (role column made nullable, clerk_user_id made nullable). This is expected.\n');

// ============================================================
// MIGRATION 2: 20260725_commerce_schema
// ============================================================
console.log('=== 2. 20260725_commerce_schema ===');
console.log('EXPECTED: categories, products, product_images, inventory, customers, coupons, orders, order_items, reviews, audit_logs');
console.log('         Plus triggers, indexes, RLS, REVOKE anon/auth');

const m2tables = query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('categories','products','product_images','inventory','customers','coupons','orders','order_items','reviews','audit_logs') ORDER BY tablename");
console.log(m2tables);

// Check a sample of critical columns from orders
const m2orders = query("SELECT column_name, is_nullable, data_type, column_default FROM information_schema.columns WHERE table_name='orders' AND table_schema='public' ORDER BY ordinal_position");
console.log('orders columns:');
console.log(m2orders);

// Check set_updated_at function
const m2fn = query("SELECT proname FROM pg_proc WHERE proname = 'set_updated_at'");
console.log('set_updated_at function:', m2fn);

console.log('');

// ============================================================
// MIGRATION 3: 20260820_full_schema
// ============================================================
console.log('=== 3. 20260820_full_schema ===');
console.log('EXPECTED: blog_posts, hero_slides, testimonials, messages, newsletter_subscribers, site_pages, site_settings, social_links, payment_transactions, receipts, communication_logs, integration_configs');
console.log('         Plus indexes, triggers, RLS, GRANT service_role, exec_sql function');

const m3tables = query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('blog_posts','hero_slides','testimonials','messages','newsletter_subscribers','site_pages','site_settings','social_links','payment_transactions','receipts','communication_logs','integration_configs') ORDER BY tablename");
console.log(m3tables);

// Check critical columns from products (should have price numeric, not price_kobo bigint)
const m3products = query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='products' AND table_schema='public' ORDER BY ordinal_position");
console.log('products columns:');
console.log(m3products);

// Check payment_transactions
const m3pt = query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='payment_transactions' AND table_schema='public' ORDER BY ordinal_position");
console.log('payment_transactions columns:');
console.log(m3pt);

console.log('');

// ============================================================
// MIGRATION 4: 20260821_expand_roles
// ============================================================
console.log('=== 4. 20260821_expand_roles ===');
console.log('EXPECTED: admin_users.role CHECK expanded to include sales_manager, sales_rep, finance, viewer');
const m4 = query("SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'admin_users'::regclass AND contype = 'c'");
console.log(m4);
console.log('');

// ============================================================
// MIGRATION 5: 20260821_rbac_fix_access
// ============================================================
console.log('=== 5. 20260821_rbac_fix_access ===');
console.log('EXPECTED: GRANT ALL on roles/permissions/role_permissions to service_role, RLS policies');
const m5grants = query("SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants WHERE table_name IN ('roles','permissions','role_permissions') AND table_schema='public' ORDER BY table_name, grantee");
console.log(m5grants);

const m5rls = query("SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('roles','permissions','role_permissions') ORDER BY tablename, policyname");
console.log(m5rls);
console.log('');

// ============================================================
// MIGRATION 6: 20260821_rbac_system
// ============================================================
console.log('=== 6. 20260821_rbac_system ===');
console.log('EXPECTED: roles, permissions, role_permissions tables, seed data (8 roles, 38 permissions), admin_users.role_id column');
const m6roles = query("SELECT key, name, is_system FROM roles ORDER BY key");
console.log('roles:');
console.log(m6roles);

const m6perms = query("SELECT count(*) as perm_count FROM permissions");
console.log('permissions count:', m6perms);

const m6rp = query("SELECT rp.role_id, r.key as role_key, count(*) as perm_count FROM role_permissions rp JOIN roles r ON r.id = rp.role_id GROUP BY rp.role_id, r.key ORDER BY r.key");
console.log('role_permissions per role:');
console.log(m6rp);

const m6ridx = query("SELECT indexname FROM pg_indexes WHERE tablename IN ('roles','permissions','role_permissions') AND schemaname='public' ORDER BY indexname");
console.log('RBAC indexes:', m6ridx);
console.log('');

// ============================================================
// MIGRATION 7: 20260822_deprecate_legacy_admin_role
// ============================================================
console.log('=== 7. 20260822_deprecate_legacy_admin_role ===');
console.log('EXPECTED: admin_users.role has no DEFAULT, is nullable, no CHECK constraint');
const m7default = query("SELECT column_name, column_default, is_nullable FROM information_schema.columns WHERE table_name='admin_users' AND column_name='role' AND table_schema='public'");
console.log(m7default);
console.log('');

// ============================================================
// MIGRATION 8: 20260823_add_admin_avatar_url
// ============================================================
console.log('=== 8. 20260823_add_admin_avatar_url ===');
console.log('EXPECTED: admin_users.avatar_url text column');
const m8 = query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='admin_users' AND column_name='avatar_url' AND table_schema='public'");
console.log(m8);
console.log('');

// ============================================================
// MIGRATION 9: 20260823_add_admin_email_column
// ============================================================
console.log('=== 9. 20260823_add_admin_email_column ===');
console.log('EXPECTED: admin_users.email text column, index where email is not null');
const m9 = query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='admin_users' AND column_name='email' AND table_schema='public'");
console.log(m9);
const m9idx = query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename='admin_users' AND indexname LIKE '%email%' AND schemaname='public'");
console.log(m9idx);
console.log('');

// ============================================================
// MIGRATION 10: 20260824_admin_notification_reads
// ============================================================
console.log('=== 10. 20260824_admin_notification_reads ===');
console.log('EXPECTED: table with id, admin_user_id(FK), audit_log_id(FK bigint), read_at, created_at, UNIQUE(admin_user_id,audit_log_id)');
console.log('         GRANT service_role, REVOKE anon/auth, RLS with permissive policy');
const m10 = query("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='admin_notification_reads' AND table_schema='public' ORDER BY ordinal_position");
console.log(m10);
const m10c = query("SELECT conname, contype::text, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'admin_notification_reads'::regclass ORDER BY contype, conname")
console.log(m10c);
const m10grants = query("SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='admin_notification_reads' AND table_schema='public' ORDER BY grantee");
console.log(m10grants);
const m10pol = query("SELECT policyname FROM pg_policies WHERE tablename='admin_notification_reads' ORDER BY policyname")
console.log(m10pol);
console.log('');

// ============================================================
// MIGRATION 11: 20260824_fix_staff_invitation_model
// ============================================================
console.log('=== 11. 20260824_fix_staff_invitation_model ===');
console.log('EXPECTED: clerk_user_id nullable, email nullable, avatar_url nullable, email_idx, pending_email_uniq partial index');
const m11null = query("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='admin_users' AND column_name IN ('clerk_user_id','email','avatar_url') AND table_schema='public'");
console.log(m11null);
const m11idx = query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename='admin_users' AND schemaname='public' AND (indexname LIKE '%email%' OR indexname LIKE '%pending%') ORDER BY indexname")
console.log(m11idx);
console.log('');

// ============================================================
// MIGRATION 12: 20260825_marketing_suppression
// ============================================================
console.log('=== 12. 20260825_marketing_suppression ===');
console.log('EXPECTED: marketing_suppression table, normalize trigger, UNIQUE(email), unsubscribe_token on customers+newsletter, RLS');
const m12 = query("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='marketing_suppression' AND table_schema='public' ORDER BY ordinal_position");
console.log(m12);
const m12c = query("SELECT conname, contype::text, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'marketing_suppression'::regclass ORDER BY contype")
console.log(m12c);
const m12tok_cust = query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='customers' AND column_name='unsubscribe_token' AND table_schema='public'")
console.log('customers.unsubscribe_token:', m12tok_cust);
const m12tok_news = query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='newsletter_subscribers' AND column_name='unsubscribe_token' AND table_schema='public'")
console.log('newsletter_subscribers.unsubscribe_token:', m12tok_news);
const m12trg = query("SELECT triggername FROM pg_trigger WHERE tgrelid = 'marketing_suppression'::regclass AND NOT tgisinternal")
console.log('triggers:', m12trg);
console.log('');

// ============================================================
// MIGRATION 13: 20260825_testimonial_public_submission
// ============================================================
console.log('=== 13. 20260825_testimonial_public_submission ===');
console.log('EXPECTED: testimonials has email, photo_url, consent_to_publish(bool,default false), moderation_status(text, CHECK in pending/approved/rejected,default pending), moderated_at');
const m13 = query("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name='testimonials' AND table_schema='public' ORDER BY ordinal_position")
console.log(m13);
const m13c = query("SELECT conname, contype::text, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'testimonials'::regclass AND contype = 'c'")
console.log(m13c);
const m13idx = query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename='testimonials' AND schemaname='public' ORDER BY indexname")
console.log(m13idx);
console.log('');

// ============================================================
// CHECKOUT PREFLIGHT (MIGRATION 14: 20260826_checkout_hardening)
// ============================================================
console.log('=== 14. 20260826_checkout_hardening (NOT YET APPLIED) ===');
console.log('EXPECTED: NOT YET LIVE — verifying absence');

const m14col = query("SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name='checkout_attempt_id' AND table_schema='public'")
console.log('checkout_attempt_id:', m14col || 'NOT FOUND (correct)');

const m14idx = query("SELECT indexname FROM pg_indexes WHERE tablename='orders' AND indexname LIKE '%checkout%' AND schemaname='public'")
console.log('checkout indexes:', m14idx || 'NONE (correct)');

const m14status = query("SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conrelid = 'orders'::regclass AND contype = 'c'")
console.log('orders CHECK constraints:', m14status);

const m14receipt = query("SELECT conname, contype::text FROM pg_constraint WHERE conrelid = 'receipts'::regclass AND contype = 'u'")
console.log('receipts UNIQUE constraints:', m14receipt || 'NONE (correct — pending migration)');

console.log('');
console.log('========================================');
console.log('RECONCILIATION COMPLETE');
console.log('========================================');
