create extension if not exists pgcrypto;
create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end; $$;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(), slug text not null unique, name text not null,
  description text, active boolean not null default true, sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(), category_id uuid references public.categories(id) on delete set null,
  slug text not null unique, sku text not null unique, name text not null, tagline text, description text,
  price_kobo bigint not null check (price_kobo >= 0), compare_at_kobo bigint check (compare_at_kobo >= 0),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  featured boolean not null default false, specifications jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  public_id text not null unique, secure_url text not null, width integer not null check (width > 0),
  height integer not null check (height > 0), alt_text text not null, sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.inventory (
  product_id uuid primary key references public.products(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0), reserved integer not null default 0 check (reserved >= 0 and reserved <= quantity),
  low_stock_threshold integer not null default 3 check (low_stock_threshold >= 0), updated_at timestamptz not null default now()
);
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(), email text not null unique, first_name text not null, last_name text not null,
  phone text, marketing_consent boolean not null default false, marketing_consent_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(), code text not null unique,
  discount_type text not null check (discount_type in ('fixed','percentage')),
  discount_value integer not null check (discount_value > 0), active boolean not null default true,
  starts_at timestamptz, expires_at timestamptz, max_uses integer check (max_uses > 0), uses integer not null default 0 check (uses >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(), reference text not null unique, customer_id uuid references public.customers(id) on delete set null,
  email text not null, status text not null default 'pending' check (status in ('pending','paid','processing','shipped','delivered','cancelled','refunded')),
  subtotal_kobo bigint not null check (subtotal_kobo >= 0), discount_kobo bigint not null default 0 check (discount_kobo >= 0),
  delivery_kobo bigint not null default 0 check (delivery_kobo >= 0), total_kobo bigint not null check (total_kobo >= 0),
  coupon_id uuid references public.coupons(id) on delete set null, payment_reference text unique,
  idempotency_key uuid not null unique, shipping_address jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null, sku text not null, name text not null,
  quantity integer not null check (quantity > 0), unit_price_kobo bigint not null check (unit_price_kobo >= 0),
  line_total_kobo bigint not null check (line_total_kobo >= 0)
);
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null, rating smallint not null check (rating between 1 and 5),
  title text, body text not null, status text not null default 'pending' check (status in ('pending','approved','rejected')),
  verified_purchase boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key, clerk_user_id text not null, action text not null,
  entity_type text not null, entity_id text, metadata jsonb not null default '{}'::jsonb,
  ip_address inet, user_agent text, created_at timestamptz not null default now()
);

create index if not exists products_category_status_idx on public.products(category_id,status);
create index if not exists product_images_product_sort_idx on public.product_images(product_id,sort_order);
create index if not exists orders_customer_created_idx on public.orders(customer_id,created_at desc);
create index if not exists orders_status_created_idx on public.orders(status,created_at desc);
create index if not exists reviews_product_status_idx on public.reviews(product_id,status);
create index if not exists audit_logs_actor_created_idx on public.audit_logs(clerk_user_id,created_at desc);

create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger inventory_updated_at before update on public.inventory for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger coupons_updated_at before update on public.coupons for each row execute function public.set_updated_at();
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger reviews_updated_at before update on public.reviews for each row execute function public.set_updated_at();

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
revoke all on all tables in schema public from anon, authenticated;
comment on table public.product_images is 'Cloudinary metadata only. Image binaries are never stored in PostgreSQL.';
comment on table public.audit_logs is 'Append-only security and administration events written by trusted server code.';