-- ============================================================
-- Diplomat Global — Full application schema migration
-- All ADDITIVE. No destructive operations.
-- ============================================================

-- Ensure pgcrypto for gen_random_uuid()
create extension if not exists pgcrypto;

-- Helper: auto-set updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

-- ============================================================
-- 1. CATEGORIES
-- ============================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  icon text,
  parent_id uuid references public.categories(id) on delete set null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 2. PRODUCTS (price in Naira, NOT kobo)
-- ============================================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  slug text not null unique,
  sku text not null unique,
  name text not null,
  tagline text,
  description text,
  price numeric(12,2) not null check (price >= 0),
  compare_at_price numeric(12,2) check (compare_at_price >= 0),
  condition text default 'new' check (condition in ('new','refurbished','used')),
  is_easy_buy boolean not null default false,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  featured boolean not null default false,
  is_new boolean not null default false,
  in_stock boolean not null default true,
  specifications jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 3. PRODUCT IMAGES (Cloudinary metadata only)
-- ============================================================
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  cloudinary_public_id text not null,
  secure_url text not null,
  width integer check (width > 0),
  height integer check (height > 0),
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 4. INVENTORY
-- ============================================================
create table if not exists public.inventory (
  product_id uuid primary key references public.products(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  reserved integer not null default 0 check (reserved >= 0 and reserved <= quantity),
  low_stock_threshold integer not null default 3 check (low_stock_threshold >= 0),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 5. CUSTOMERS
-- ============================================================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  first_name text not null default '',
  last_name text not null default '',
  phone text,
  state text,
  lga text,
  city text,
  address text,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 6. COUPONS
-- ============================================================
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('fixed','percentage')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  active boolean not null default true,
  starts_at timestamptz,
  expires_at timestamptz,
  max_uses integer check (max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);

-- ============================================================
-- 7. ORDERS
-- ============================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  email text not null,
  status text not null default 'pending' check (status in ('pending','paid','processing','shipped','delivered','cancelled','refunded')),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total numeric(12,2) not null check (total >= 0),
  currency text not null default 'NGN',
  coupon_id uuid references public.coupons(id) on delete set null,
  payment_reference text unique,
  idempotency_key uuid not null unique,
  shipping_address jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 8. ORDER ITEMS
-- ============================================================
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  sku text not null,
  name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

-- ============================================================
-- 9. REVIEWS
-- ============================================================
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  title text,
  body text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  verified_purchase boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 10. AUDIT LOGS
-- ============================================================
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  clerk_user_id text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 11. BLOG POSTS
-- ============================================================
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  content text,
  category text,
  image text,
  youtube_url text,
  read_time text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 12. HERO SLIDES
-- ============================================================
create table if not exists public.hero_slides (
  id uuid primary key default gen_random_uuid(),
  eyebrow text,
  title text not null,
  body text,
  price_context text,
  category text,
  cta_text text not null default 'Shop now',
  cta_link text not null default '/products',
  image text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 13. TESTIMONIALS
-- ============================================================
create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  message text not null,
  rating smallint default 5 check (rating between 1 and 5),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 14. MESSAGES (contact form submissions)
-- ============================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 15. NEWSLETTER SUBSCRIBERS
-- ============================================================
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  is_active boolean not null default true,
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);

-- ============================================================
-- 16. SITE PAGES
-- ============================================================
create table if not exists public.site_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  content text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 17. SITE SETTINGS (key-value, public business settings only)
-- ============================================================
create table if not exists public.site_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 18. SOCIAL LINKS
-- ============================================================
create table if not exists public.social_links (
  id uuid primary key default gen_random_uuid(),
  platform text not null unique,
  url text not null,
  icon text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  link_type text default 'social' check (link_type in ('social','contact','other')),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 19. PAYMENT TRANSACTIONS
-- ============================================================
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  reference text not null unique,
  paystack_reference text,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'NGN',
  status text not null default 'initiated' check (status in ('initiated','pending','successful','failed','abandoned','refunded')),
  channel text,
  gateway_response text,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 20. RECEIPTS
-- ============================================================
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  transaction_id uuid references public.payment_transactions(id) on delete set null,
  receipt_number text not null unique,
  customer_email text not null,
  items_snapshot jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  currency text not null default 'NGN',
  status text not null default 'generated' check (status in ('generated','emailed','whatsapp_sent','failed')),
  sent_email_at timestamptz,
  sent_whatsapp_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 21. COMMUNICATION LOGS
-- ============================================================
create table if not exists public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('email','whatsapp','sms')),
  recipient text not null,
  subject text,
  body_preview text,
  provider text not null,
  status text not null default 'pending' check (status in ('pending','sent','delivered','failed')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 22. INTEGRATION CONFIGS (encrypted secrets, NOT plain text)
-- ============================================================
create table if not exists public.integration_configs (
  provider text primary key,
  config_encrypted jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  last_tested_at timestamptz,
  last_test_result text,
  updated_by text,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists categories_slug_idx on public.categories(slug);
create index if not exists categories_parent_idx on public.categories(parent_id);
create index if not exists products_category_status_idx on public.products(category_id, status);
create index if not exists products_slug_idx on public.products(slug);
create index if not exists product_images_product_sort_idx on public.product_images(product_id, sort_order);
create index if not exists orders_customer_created_idx on public.orders(customer_id, created_at desc);
create index if not exists orders_status_created_idx on public.orders(status, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists reviews_product_status_idx on public.reviews(product_id, status);
create index if not exists audit_logs_actor_created_idx on public.audit_logs(clerk_user_id, created_at desc);
create index if not exists blog_posts_slug_idx on public.blog_posts(slug);
create index if not exists blog_posts_status_idx on public.blog_posts(status, published_at desc);
create index if not exists hero_slides_active_idx on public.hero_slides(active, sort_order);
create index if not exists messages_read_idx on public.messages(is_read, created_at desc);
create index if not exists payment_transactions_order_idx on public.payment_transactions(order_id);
create index if not exists payment_transactions_reference_idx on public.payment_transactions(reference);
create index if not exists payment_transactions_status_idx on public.payment_transactions(status);
create index if not exists receipts_order_idx on public.receipts(order_id);
create index if not exists receipts_number_idx on public.receipts(receipt_number);
create index if not exists communication_logs_type_status_idx on public.communication_logs(type, status);

-- ============================================================
-- TRIGGERS (auto-update updated_at)
-- ============================================================
create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger inventory_updated_at before update on public.inventory for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger coupons_updated_at before update on public.coupons for each row execute function public.set_updated_at();
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger reviews_updated_at before update on public.reviews for each row execute function public.set_updated_at();
create trigger blog_posts_updated_at before update on public.blog_posts for each row execute function public.set_updated_at();
create trigger hero_slides_updated_at before update on public.hero_slides for each row execute function public.set_updated_at();
create trigger testimonials_updated_at before update on public.testimonials for each row execute function public.set_updated_at();
create trigger site_pages_updated_at before update on public.site_pages for each row execute function public.set_updated_at();
create trigger payment_transactions_updated_at before update on public.payment_transactions for each row execute function public.set_updated_at();

-- ============================================================
-- RLS: Enable on all tables, deny anon/authenticated, server-only
-- ============================================================
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory enable row level security;
alter table public.customers enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.reviews enable row level security;
alter table public.audit_logs enable row level security;
alter table public.blog_posts enable row level security;
alter table public.hero_slides enable row level security;
alter table public.testimonials enable row level security;
alter table public.messages enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.site_pages enable row level security;
alter table public.site_settings enable row level security;
alter table public.social_links enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.receipts enable row level security;
alter table public.communication_logs enable row level security;
alter table public.integration_configs enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- Grant service_role full access to all tables (required for server-side operations)
do $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.tablename);
  END LOOP;
END $$;
grant usage on all sequences in schema public to service_role;

-- Create exec_sql helper for future migrations
CREATE OR REPLACE FUNCTION public.exec_sql(sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN EXECUTE sql; END $$;
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;

-- Comments
comment on table public.product_images is 'Cloudinary metadata only. Image binaries are never stored in PostgreSQL.';
comment on table public.audit_logs is 'Append-only security and administration events written by trusted server code.';
comment on table public.integration_configs is 'Encrypted API/provider credentials. Never expose full values to the browser.';
comment on table public.receipts is 'Immutable purchase snapshots. Historical receipts do not change when product prices change.';
