-- Historical scaffold only. Do not apply for a new installation; use migrations/ instead.
create table public.categories (
 id text primary key, name text not null, description text not null default '', sort_order integer not null default 0
);
create table public.products (
 id text primary key, category_id text not null references public.categories(id), slug text not null unique,
 name text not null, description text not null default '', price_grosz integer not null check(price_grosz>=0),
 weight_grams integer check(weight_grams>0), pieces integer check(pieces>0), ingredients text[], allergens text[],
 image text, available boolean not null default true, source_url text, verified_at date, updated_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 first_name text not null default '', last_name text not null default '', phone text not null default '', updated_at timestamptz not null default now()
);
create table public.addresses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 label text not null, street text not null, building text not null, apartment text not null default '',
 postal_code text not null, city text not null
);
create table public.orders (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null,
 idempotency_key uuid not null unique, number text unique not null,
 status text not null check(status in ('pending','accepted','preparing','ready','completed','cancelled')),
 fulfillment text not null check(fulfillment in ('pickup','delivery')),
 customer jsonb not null, address jsonb, preferred_time timestamptz, notes text not null default '',
 payment_method text not null, payment_status text not null default 'unpaid' check(payment_status in ('unpaid','paid','refunded')),
 subtotal_grosz integer not null check(subtotal_grosz>=0), delivery_fee_grosz integer not null check(delivery_fee_grosz>=0),
 total_grosz integer generated always as (subtotal_grosz + delivery_fee_grosz) stored,
 created_at timestamptz not null default now()
);
create table public.order_items (
 id bigint generated always as identity primary key, order_id uuid not null references public.orders(id) on delete cascade,
 product_id text references public.products(id), name text not null,
 quantity integer not null check(quantity between 1 and 99), unit_price_grosz integer not null check(unit_price_grosz>=0)
);
create index addresses_user_idx on public.addresses(user_id);
create index orders_user_idx on public.orders(user_id,created_at desc);
create index order_items_order_idx on public.order_items(order_id);
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
create policy catalog_categories_read on public.categories for select to anon,authenticated using(true);
create policy catalog_products_read on public.products for select to anon,authenticated using(true);
create policy own_profile_read on public.profiles for select to authenticated using((select auth.uid())=id);
create policy own_profile_insert on public.profiles for insert to authenticated with check((select auth.uid())=id);
create policy own_profile_update on public.profiles for update to authenticated using((select auth.uid())=id) with check((select auth.uid())=id);
create policy own_addresses on public.addresses for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy own_orders_read on public.orders for select to authenticated using((select auth.uid())=user_id);
create policy own_items_read on public.order_items for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id and o.user_id=(select auth.uid())));
-- No browser insert/update policies for orders, order_items or catalog.
-- Only a trusted server may price orders, set their state and manage products.
revoke all on public.categories,public.products,public.profiles,public.addresses,public.orders,public.order_items from anon,authenticated;
grant select on public.categories,public.products to anon,authenticated;
grant select,insert,update on public.profiles to authenticated;
grant select,insert,update,delete on public.addresses to authenticated;
grant select on public.orders,public.order_items to authenticated;
