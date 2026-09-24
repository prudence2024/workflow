-- ============================================================
-- RBAC System Migration
-- Safe: preserves existing admin_users and owner access
-- ============================================================

-- 1. Create roles table
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create permissions table
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create role_permissions junction table
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- 4. Seed system roles
INSERT INTO public.roles (key, name, description, is_system) VALUES
  ('owner', 'Owner', 'Full system access. Can manage staff, refunds, integrations, and all settings.', true),
  ('admin', 'Administrator', 'Broad access to most features. Cannot manage other administrators or system secrets.', true),
  ('sales_manager', 'Sales Manager', 'Access to sales analytics, products, customers, orders, and sales team data.', true),
  ('sales_rep', 'Sales Representative', 'View products, customers, orders. Update approved workflow states. No financial access.', true),
  ('finance', 'Finance', 'Access payments, transactions, receipts, refunds, and financial analytics.', true),
  ('editor', 'Content Editor', 'Edit blog, hero slides, testimonials, pages, media. No financial or system access.', true),
  ('support', 'Support', 'View orders, customers, messages. No refunds or system access.', true),
  ('viewer', 'Viewer', 'Read-only access to permitted areas. Cannot modify any data.', true)
ON CONFLICT (key) DO NOTHING;

-- 5. Seed permissions
INSERT INTO public.permissions (key, name, description) VALUES
  ('products.view', 'View Products', 'View product catalog'),
  ('products.create', 'Create Products', 'Create new products'),
  ('products.edit', 'Edit Products', 'Edit product details'),
  ('products.archive', 'Archive Products', 'Archive/delete products'),
  ('categories.manage', 'Manage Categories', 'Create/edit/delete categories'),
  ('inventory.view', 'View Inventory', 'View stock levels'),
  ('inventory.edit', 'Edit Inventory', 'Adjust stock levels'),
  ('orders.view', 'View Orders', 'View order list and details'),
  ('orders.update', 'Update Orders', 'Change order status and details'),
  ('customers.view', 'View Customers', 'View customer list'),
  ('customers.edit', 'Edit Customers', 'Edit customer details'),
  ('payments.view', 'View Payments', 'View payment transactions'),
  ('transactions.view', 'View Transactions', 'View transaction history'),
  ('receipts.view', 'View Receipts', 'View receipt records'),
  ('receipts.send', 'Send Receipts', 'Resend receipt emails'),
  ('refunds.view', 'View Refunds', 'View refund records'),
  ('refunds.create', 'Create Refunds', 'Initiate payment refunds'),
  ('content.manage', 'Manage Content', 'Create/edit/delete blog, pages, media'),
  ('blog.manage', 'Manage Blog', 'Create/edit/delete blog posts'),
  ('hero.manage', 'Manage Hero Slides', 'Create/edit/delete hero slides'),
  ('testimonials.manage', 'Manage Testimonials', 'Create/edit/delete testimonials'),
  ('social_links.manage', 'Manage Social Links', 'Create/edit/delete social links'),
  ('pages.manage', 'Manage Pages', 'Create/edit/delete site pages'),
  ('reviews.manage', 'Manage Reviews', 'Approve/reject/delete reviews'),
  ('messages.view', 'View Messages', 'View contact form messages'),
  ('messages.manage', 'Manage Messages', 'Delete/archive messages'),
  ('newsletter.view', 'View Newsletter', 'View newsletter subscribers'),
  ('newsletter.manage', 'Manage Newsletter', 'Manage subscriber list'),
  ('coupons.manage', 'Manage Coupons', 'Create/edit/delete coupons'),
  ('settings.manage', 'Manage Settings', 'Update site settings'),
  ('staff.manage', 'Manage Staff', 'Add/remove/edit staff members'),
  ('roles.manage', 'Manage Roles', 'Create/edit/delete custom roles'),
  ('integrations.view', 'View Integrations', 'View integration status'),
  ('integrations.manage', 'Manage Integrations', 'Update integration configs'),
  ('backup.create', 'Create Backups', 'Initiate manual backups'),
  ('backup.restore', 'Restore Backups', 'Restore from backup (Owner only)'),
  ('analytics.view', 'View Analytics', 'View dashboard analytics'),
  ('audit.view', 'View Audit Logs', 'View audit log history')
ON CONFLICT (key) DO NOTHING;

-- 6. Assign permissions to system roles
-- Owner gets everything
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p WHERE r.key = 'owner'
ON CONFLICT DO NOTHING;

-- Admin gets most things except role/backup management
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'admin' AND p.key NOT IN ('roles.manage', 'backup.restore')
ON CONFLICT DO NOTHING;

-- Sales Manager
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'sales_manager' AND p.key IN ('products.view', 'orders.view', 'orders.update', 'customers.view', 'customers.edit', 'analytics.view', 'reviews.manage', 'refunds.view')
ON CONFLICT DO NOTHING;

-- Sales Rep
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'sales_rep' AND p.key IN ('products.view', 'orders.view', 'customers.view')
ON CONFLICT DO NOTHING;

-- Finance
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'finance' AND p.key IN ('payments.view', 'transactions.view', 'receipts.view', 'receipts.send', 'refunds.view', 'refunds.create', 'analytics.view', 'orders.view', 'customers.view')
ON CONFLICT DO NOTHING;

-- Editor
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'editor' AND p.key IN ('content.manage', 'blog.manage', 'hero.manage', 'testimonials.manage', 'social_links.manage', 'pages.manage', 'media')
ON CONFLICT DO NOTHING;

-- Support
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'support' AND p.key IN ('orders.view', 'customers.view', 'customers.edit', 'messages.view', 'messages.manage')
ON CONFLICT DO NOTHING;

-- Viewer
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'viewer' AND p.key IN ('products.view', 'orders.view', 'customers.view')
ON CONFLICT DO NOTHING;

-- 7. Add role_id column to admin_users (nullable initially for migration safety)
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.roles(id);

-- 8. Migrate existing role text values to role_id
UPDATE public.admin_users au
SET role_id = r.id
FROM public.roles r
WHERE r.key = au.role AND au.role_id IS NULL;

-- 9. Create indexes
CREATE INDEX IF NOT EXISTS roles_key_idx ON public.roles(key);
CREATE INDEX IF NOT EXISTS permissions_key_idx ON public.permissions(key);
CREATE INDEX IF NOT EXISTS role_permissions_role_idx ON public.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS role_permissions_perm_idx ON public.role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS admin_users_role_id_idx ON public.admin_users(role_id);

-- 10. Enable RLS
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.roles FROM anon, authenticated;
REVOKE ALL ON public.permissions FROM anon, authenticated;
REVOKE ALL ON public.role_permissions FROM anon, authenticated;

-- 11. Auto-update updated_at trigger for roles
CREATE TRIGGER roles_updated_at BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
