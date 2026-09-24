-- ============================================================
-- Diplomat Global — Live Schema Baseline
-- Generated: 2026-08-27 from live Supabase inspection
-- Project: urorrrmyzsuwulfljvwm
--
-- This is a snapshot of the CURRENT live database schema.
-- It represents the final state after all 13 historical
-- migrations (20260725 through 20260825) were applied.
--
-- DO NOT MODIFY the remote database with this migration.
-- It is a no-op baseline for Supabase CLI tracking.
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================
-- FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_marketing_suppression_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.email := lower(trim(NEW.email));
  RETURN NEW;
END;
$$;

-- ============================================================
-- 1. ADMIN_USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id text UNIQUE CHECK (length(clerk_user_id) >= 8 AND length(clerk_user_id) <= 255),
  role text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  role_id uuid REFERENCES public.roles(id),
  email text,
  avatar_url text
);

CREATE INDEX IF NOT EXISTS admin_users_active_role_idx ON public.admin_users (active, role);
CREATE INDEX IF NOT EXISTS admin_users_role_id_idx ON public.admin_users (role_id);
CREATE INDEX IF NOT EXISTS admin_users_email_unique_idx ON public.admin_users (email) WHERE email IS NOT NULL;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.admin_users
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 2. ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roles_key_idx ON public.roles (key);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. PERMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS permissions_key_idx ON public.permissions (key);

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. ROLE_PERMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS role_permissions_role_idx ON public.role_permissions (role_id);
CREATE INDEX IF NOT EXISTS role_permissions_perm_idx ON public.role_permissions (permission_id);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  icon text,
  parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS categories_slug_idx ON public.categories (slug);
CREATE INDEX IF NOT EXISTS categories_parent_idx ON public.categories (parent_id);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  slug text NOT NULL UNIQUE,
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  tagline text,
  description text,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  compare_at_price numeric(12,2) CHECK (compare_at_price >= 0),
  condition text DEFAULT 'new' CHECK (condition IN ('new','refurbished','used')),
  is_easy_buy boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  featured boolean NOT NULL DEFAULT false,
  is_new boolean NOT NULL DEFAULT false,
  in_stock boolean NOT NULL DEFAULT true,
  specifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_category_status_idx ON public.products (category_id, status);
CREATE INDEX IF NOT EXISTS products_slug_idx ON public.products (slug);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. PRODUCT_IMAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  cloudinary_public_id text NOT NULL,
  secure_url text NOT NULL,
  width integer CHECK (width > 0),
  height integer CHECK (height > 0),
  alt_text text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_images_product_sort_idx ON public.product_images (product_id, sort_order);

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. INVENTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= quantity),
  low_stock_threshold integer NOT NULL DEFAULT 3 CHECK (low_stock_threshold >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  phone text,
  state text,
  lga text,
  city text,
  address text,
  marketing_consent boolean NOT NULL DEFAULT false,
  marketing_consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
  marketing_unsubscribed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_unsubscribe_token ON public.customers (unsubscribe_token) WHERE unsubscribe_token IS NOT NULL;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 10. COUPONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_type text NOT NULL CHECK (discount_type IN ('fixed','percentage')),
  discount_value numeric(12,2) NOT NULL CHECK (discount_value > 0),
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  expires_at timestamptz,
  max_uses integer CHECK (max_uses > 0),
  uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 11. ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','processing','shipped','delivered','cancelled','refunded')),
  subtotal numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  discount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  total numeric(12,2) NOT NULL CHECK (total >= 0),
  currency text NOT NULL DEFAULT 'NGN',
  coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  payment_reference text UNIQUE,
  idempotency_key uuid NOT NULL UNIQUE,
  shipping_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_customer_created_idx ON public.orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON public.orders (status, created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 12. ORDER_ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  sku text NOT NULL,
  name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX IF NOT EXISTS order_items_order_idx ON public.order_items (order_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 13. REVIEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  verified_purchase boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reviews_product_status_idx ON public.reviews (product_id, status);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 14. AUDIT_LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clerk_user_id text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx ON public.audit_logs (clerk_user_id, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 15. BLOG_POSTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text,
  content text,
  category text,
  image text,
  youtube_url text,
  read_time text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blog_posts_slug_idx ON public.blog_posts (slug);
CREATE INDEX IF NOT EXISTS blog_posts_status_idx ON public.blog_posts (status, published_at DESC);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 16. HERO_SLIDES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hero_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eyebrow text,
  title text NOT NULL,
  body text,
  price_context text,
  category text,
  cta_text text NOT NULL DEFAULT 'Shop now',
  cta_link text NOT NULL DEFAULT '/products',
  image text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hero_slides_active_idx ON public.hero_slides (active, sort_order);

ALTER TABLE public.hero_slides ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 17. TESTIMONIALS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text,
  message text NOT NULL,
  rating smallint DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  email text,
  photo_url text,
  consent_to_publish boolean NOT NULL DEFAULT false,
  moderation_status text NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending','approved','rejected')),
  moderated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_testimonials_moderation_status ON public.testimonials (moderation_status);
CREATE INDEX IF NOT EXISTS idx_testimonials_public_display ON public.testimonials (active, moderation_status, sort_order) WHERE active = true AND moderation_status = 'approved';

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 18. MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  subject text,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_read_idx ON public.messages (is_read, created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 19. NEWSLETTER_SUBSCRIBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz,
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_unsubscribe_token ON public.newsletter_subscribers (unsubscribe_token) WHERE unsubscribe_token IS NOT NULL;

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 20. SITE_PAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.site_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  content text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 21. SITE_SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.site_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 22. SOCIAL_LINKS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.social_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL UNIQUE,
  url text NOT NULL,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  link_type text DEFAULT 'social' CHECK (link_type IN ('social','contact','other')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.social_links ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 23. PAYMENT_TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reference text NOT NULL UNIQUE,
  paystack_reference text,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','pending','successful','failed','abandoned','refunded')),
  channel text,
  gateway_response text,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_transactions_order_idx ON public.payment_transactions (order_id);
CREATE INDEX IF NOT EXISTS payment_transactions_reference_idx ON public.payment_transactions (reference);
CREATE INDEX IF NOT EXISTS payment_transactions_status_idx ON public.payment_transactions (status);

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 24. RECEIPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  receipt_number text NOT NULL UNIQUE,
  customer_email text NOT NULL,
  items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) NOT NULL DEFAULT 0,
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','emailed','whatsapp_sent','failed')),
  sent_email_at timestamptz,
  sent_whatsapp_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS receipts_order_idx ON public.receipts (order_id);
CREATE INDEX IF NOT EXISTS receipts_number_idx ON public.receipts (receipt_number);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 25. COMMUNICATION_LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.communication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('email','whatsapp','sms')),
  recipient text NOT NULL,
  subject text,
  body_preview text,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','failed')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS communication_logs_type_status_idx ON public.communication_logs (type, status);

ALTER TABLE public.communication_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 26. INTEGRATION_CONFIGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.integration_configs (
  provider text PRIMARY KEY,
  config_encrypted jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  last_tested_at timestamptz,
  last_test_result text,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 27. ADMIN_NOTIFICATION_READS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admin_notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  audit_log_id bigint NOT NULL REFERENCES public.audit_logs(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(admin_user_id, audit_log_id)
);

ALTER TABLE public.admin_notification_reads ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 28. MARKETING_SUPPRESSION
-- ============================================================
CREATE TABLE IF NOT EXISTS public.marketing_suppression (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  reason text NOT NULL DEFAULT 'unsubscribed',
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_suppression_email_unique UNIQUE (email)
);

DROP TRIGGER IF EXISTS trg_normalize_suppression_email ON public.marketing_suppression;
CREATE TRIGGER trg_normalize_suppression_email
  BEFORE INSERT OR UPDATE ON public.marketing_suppression
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_marketing_suppression_email();

ALTER TABLE public.marketing_suppression ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_marketing_suppression ON public.marketing_suppression
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- TRIGGERS (auto-update updated_at)
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'categories_updated_at' AND tgrelid = 'categories'::regclass) THEN
    CREATE TRIGGER categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'products_updated_at' AND tgrelid = 'products'::regclass) THEN
    CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'inventory_updated_at' AND tgrelid = 'inventory'::regclass) THEN
    CREATE TRIGGER inventory_updated_at BEFORE UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'customers_updated_at' AND tgrelid = 'customers'::regclass) THEN
    CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'coupons_updated_at' AND tgrelid = 'coupons'::regclass) THEN
    CREATE TRIGGER coupons_updated_at BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'orders_updated_at' AND tgrelid = 'orders'::regclass) THEN
    CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'reviews_updated_at' AND tgrelid = 'reviews'::regclass) THEN
    CREATE TRIGGER reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'blog_posts_updated_at' AND tgrelid = 'blog_posts'::regclass) THEN
    CREATE TRIGGER blog_posts_updated_at BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'hero_slides_updated_at' AND tgrelid = 'hero_slides'::regclass) THEN
    CREATE TRIGGER hero_slides_updated_at BEFORE UPDATE ON public.hero_slides FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'testimonials_updated_at' AND tgrelid = 'testimonials'::regclass) THEN
    CREATE TRIGGER testimonials_updated_at BEFORE UPDATE ON public.testimonials FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'site_pages_updated_at' AND tgrelid = 'site_pages'::regclass) THEN
    CREATE TRIGGER site_pages_updated_at BEFORE UPDATE ON public.site_pages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'payment_transactions_updated_at' AND tgrelid = 'payment_transactions'::regclass) THEN
    CREATE TRIGGER payment_transactions_updated_at BEFORE UPDATE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ============================================================
-- GRANTS (service_role only; anon/authenticated revoked)
-- ============================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.tablename);
  END LOOP;
END $$;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- ============================================================
-- SEED DATA: System roles and permissions
-- ============================================================
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

-- Role-permission assignments
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p WHERE r.key = 'owner'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'admin' AND p.key NOT IN ('roles.manage', 'backup.restore')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'sales_manager' AND p.key IN ('products.view', 'orders.view', 'orders.update', 'customers.view', 'customers.edit', 'analytics.view', 'reviews.manage', 'refunds.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'sales_rep' AND p.key IN ('products.view', 'orders.view', 'customers.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'finance' AND p.key IN ('payments.view', 'transactions.view', 'receipts.view', 'receipts.send', 'refunds.view', 'refunds.create', 'analytics.view', 'orders.view', 'customers.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'editor' AND p.key IN ('content.manage', 'blog.manage', 'hero.manage', 'testimonials.manage', 'social_links.manage', 'pages.manage')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'support' AND p.key IN ('orders.view', 'customers.view', 'customers.edit', 'messages.view', 'messages.manage')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r, public.permissions p
WHERE r.key = 'viewer' AND p.key IN ('products.view', 'orders.view', 'customers.view')
ON CONFLICT DO NOTHING;
