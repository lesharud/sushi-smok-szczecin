-- Guest checkout. Supports a fresh DB and the previous optional scaffold.
begin;
create table if not exists public.categories (
  id text primary key, name text not null, description text not null default '', sort_order integer not null default 0
);
create table if not exists public.products (
  id text primary key, category_id text not null references public.categories(id), slug text not null unique,
  name text not null, description text not null default '', price_grosz integer not null check(price_grosz >= 0),
  weight_grams integer check(weight_grams > 0), pieces integer check(pieces > 0), ingredients text[], allergens text[],
  image text, available boolean not null default true, source_url text, verified_at date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.products add column if not exists created_at timestamptz not null default now();
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(), idempotency_key uuid not null unique, number text not null unique,
  status text not null default 'new', fulfillment text not null check(fulfillment in ('pickup','delivery')),
  customer jsonb not null, address jsonb, preferred_time timestamptz, notes text not null default '',
  payment_method text not null default 'unconfirmed', payment_status text not null default 'unpaid',
  subtotal_grosz integer not null check(subtotal_grosz >= 0), delivery_fee_grosz integer not null check(delivery_fee_grosz >= 0),
  total_grosz integer generated always as (subtotal_grosz + delivery_fee_grosz) stored,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create sequence public.order_number_seq start with 100001;
alter table public.orders add column if not exists updated_at timestamptz not null default now();
alter table public.orders add column if not exists receipt_hash text;
alter table public.orders add column if not exists request_hash text;
alter table public.orders add column if not exists customer_phone_hash text;
alter table public.orders alter column payment_method set default 'unconfirmed';
alter table public.orders drop constraint if exists orders_status_check;
update public.orders set status = 'new' where status = 'pending';
update public.orders set status = 'delivered' where status = 'completed';
alter table public.orders add constraint orders_status_check check(status in ('new','accepted','preparing','ready','delivered','cancelled'));
alter table public.orders alter column status set default 'new';
create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text references public.products(id), name text not null,
  quantity integer not null check(quantity between 1 and 99), unit_price_grosz integer not null check(unit_price_grosz >= 0),
  line_total_grosz integer generated always as (quantity * unit_price_grosz) stored, image text
);
alter table public.order_items add column if not exists line_total_grosz integer generated always as (quantity * unit_price_grosz) stored;
alter table public.order_items add column if not exists image text;
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists orders_status_created_idx on public.orders(status, created_at desc);
create index if not exists orders_phone_created_idx on public.orders(customer_phone_hash, created_at desc);
create table public.order_settings (
  id boolean primary key default true check(id),
  ordering_enabled boolean not null default true,
  delivery_enabled boolean not null default false,
  delivery_fee_grosz integer check(delivery_fee_grosz between 0 and 100000),
  updated_at timestamptz not null default now(),
  check(not delivery_enabled or delivery_fee_grosz is not null)
);
-- No delivery tariff has been confirmed. Never invent a zero delivery fee.
insert into public.order_settings(id) values (true);
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger products_updated before update on public.products for each row execute function public.touch_updated_at();
create trigger orders_updated before update on public.orders for each row execute function public.touch_updated_at();
create trigger order_settings_updated before update on public.order_settings for each row execute function public.touch_updated_at();

alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_settings enable row level security;
revoke all on public.categories, public.products, public.orders, public.order_items, public.order_settings from anon, authenticated;
-- Disable previously provisioned customer-account tables without deleting any data.
do $$ begin
  if to_regclass('public.profiles') is not null then execute 'revoke all on public.profiles from anon, authenticated'; end if;
  if to_regclass('public.addresses') is not null then execute 'revoke all on public.addresses from anon, authenticated'; end if;
end $$;
grant select, insert, update, delete on public.categories, public.products, public.orders, public.order_items, public.order_settings to service_role;
grant usage, select on sequence public.order_items_id_seq to service_role;

-- Receipt contains snapshots and amounts, never customer contact details.
create function public.get_guest_order(p_key uuid, p_receipt_hash text) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id, 'number', o.number, 'status', o.status, 'createdAt', o.created_at,
    'fulfillment', o.fulfillment, 'subtotalGrosz', o.subtotal_grosz,
    'deliveryFeeGrosz', o.delivery_fee_grosz, 'totalGrosz', o.total_grosz,
    'items', (select jsonb_agg(jsonb_build_object('productId', i.product_id, 'name', i.name,
      'quantity', i.quantity, 'unitPriceGrosz', i.unit_price_grosz, 'lineTotalGrosz', i.line_total_grosz, 'image', i.image) order by i.id)
      from public.order_items i where i.order_id = o.id)
  ) from public.orders o where o.idempotency_key = p_key and o.receipt_hash = p_receipt_hash;
$$;

create function public.create_guest_order(p_key uuid, p_receipt_hash text, p_request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.orders%rowtype;
  v_settings public.order_settings%rowtype;
  v_product public.products%rowtype;
  v_item jsonb; v_address jsonb; v_items jsonb := '[]'::jsonb;
  v_name text; v_phone text; v_hash text; v_phone_hash text; v_quantity integer;
  v_count integer := 0; v_subtotal bigint := 0; v_fee integer := 0; v_order_id uuid;
  v_preferred timestamptz;
begin
  if p_key is null or p_receipt_hash is null or p_receipt_hash !~ '^[0-9a-f]{64}$'
    or p_request is null or jsonb_typeof(p_request) <> 'object' then raise exception 'INVALID_REQUEST'; end if;
  if exists(select 1 from jsonb_object_keys(p_request) k where k not in ('items','customer','fulfillment','address','notes','preferredTime')) then raise exception 'INVALID_REQUEST'; end if;
  v_hash := encode(sha256(convert_to(p_request::text, 'UTF8')), 'hex');
  -- Concurrent requests sharing a key serialize; a completed retry returns the original snapshots.
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));
  select * into v_existing from public.orders where idempotency_key = p_key;
  if found then
    if v_existing.request_hash is distinct from v_hash or v_existing.receipt_hash is distinct from p_receipt_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return public.get_guest_order(p_key, p_receipt_hash);
  end if;
  if jsonb_typeof(p_request->'items') is distinct from 'array' then raise exception 'INVALID_ITEMS'; end if;
  if jsonb_array_length(p_request->'items') not between 1 and 50 then raise exception 'INVALID_ITEMS'; end if;
  if jsonb_typeof(p_request->'customer') is distinct from 'object' then raise exception 'INVALID_CUSTOMER'; end if;
  if exists(select 1 from jsonb_object_keys(p_request->'customer') k where k not in ('name','phone')) then raise exception 'INVALID_CUSTOMER'; end if;
  v_name := btrim(p_request->'customer'->>'name'); v_phone := p_request->'customer'->>'phone';
  if jsonb_typeof(p_request->'customer'->'name') is distinct from 'string' or v_name is null or char_length(v_name) not between 2 and 100
    or jsonb_typeof(p_request->'customer'->'phone') is distinct from 'string' or v_phone is null or v_phone !~ '^\+?[0-9]{9,15}$' then raise exception 'INVALID_CUSTOMER'; end if;
  if p_request->>'fulfillment' is null or p_request->>'fulfillment' not in ('pickup','delivery') then raise exception 'INVALID_REQUEST'; end if;
  if jsonb_typeof(p_request->'notes') is distinct from 'string' or char_length(p_request->>'notes') > 1000 then raise exception 'INVALID_REQUEST'; end if;
  if coalesce(p_request->>'preferredTime','') <> '' then
    begin v_preferred := (p_request->>'preferredTime')::timestamptz;
    exception when others then raise exception 'INVALID_TIME'; end;
    if v_preferred < now() or v_preferred > now() + interval '1 year' then raise exception 'INVALID_TIME'; end if;
  end if;
  select * into v_settings from public.order_settings where id = true for share;
  if not found or not v_settings.ordering_enabled then raise exception 'ORDERING_UNAVAILABLE'; end if;
  if p_request->>'fulfillment' = 'delivery' then
    if not v_settings.delivery_enabled or v_settings.delivery_fee_grosz is null then raise exception 'DELIVERY_UNAVAILABLE'; end if;
    v_fee := v_settings.delivery_fee_grosz;
    v_address := p_request->'address';
    if jsonb_typeof(v_address) is distinct from 'object' then raise exception 'INVALID_ADDRESS'; end if;
    if exists(select 1 from jsonb_object_keys(v_address) k where k not in ('street','building','apartment','postalCode','city')) then raise exception 'INVALID_ADDRESS'; end if;
    if exists(select 1 from unnest(array['street','building','apartment','postalCode','city']) k where jsonb_typeof(v_address->k) is distinct from 'string')
      or char_length(btrim(v_address->>'street')) not between 2 and 150
      or char_length(btrim(v_address->>'building')) not between 1 and 30
      or char_length(v_address->>'apartment') > 30
      or (v_address->>'postalCode') !~ '^[0-9]{2}-[0-9]{3}$'
      or char_length(btrim(v_address->>'city')) not between 2 and 100 then raise exception 'INVALID_ADDRESS'; end if;
  elsif p_request->'address' is distinct from 'null'::jsonb then raise exception 'INVALID_ADDRESS'; end if;
  if (select count(*) <> count(distinct item->>'productId') from jsonb_array_elements(p_request->'items') item) then raise exception 'INVALID_ITEMS'; end if;
  -- Rate limit is shared across all Vercel instances and does not store raw IP addresses.
  v_phone_hash := encode(sha256(convert_to(v_phone, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('phone:' || v_phone_hash, 0));
  if (select count(*) from public.orders where customer_phone_hash = v_phone_hash and created_at > now() - interval '15 minutes') >= 5 then raise exception 'RATE_LIMITED'; end if;
  for v_item in select value from jsonb_array_elements(p_request->'items') order by value->>'productId' loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'INVALID_ITEMS'; end if;
    if exists(select 1 from jsonb_object_keys(v_item) k where k not in ('productId','quantity')) then raise exception 'INVALID_ITEMS'; end if;
    if jsonb_typeof(v_item->'productId') is distinct from 'string' or char_length(v_item->>'productId') not between 1 and 150
      or jsonb_typeof(v_item->'quantity') is distinct from 'number' or (v_item->>'quantity') !~ '^[1-9][0-9]?$' then raise exception 'INVALID_ITEMS'; end if;
    v_quantity := (v_item->>'quantity')::integer; v_count := v_count + v_quantity;
    if v_count > 200 then raise exception 'INVALID_ITEMS'; end if;
    select * into v_product from public.products where id = v_item->>'productId' for share;
    if not found or not v_product.available then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    v_subtotal := v_subtotal + v_product.price_grosz::bigint * v_quantity;
    if v_subtotal + v_fee > 2147483647 then raise exception 'INVALID_ITEMS'; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', v_product.id, 'name', v_product.name, 'quantity', v_quantity, 'price', v_product.price_grosz, 'image', v_product.image));
  end loop;
  insert into public.orders(idempotency_key, receipt_hash, request_hash, customer_phone_hash, number, status, fulfillment, customer, address, preferred_time, notes, subtotal_grosz, delivery_fee_grosz)
  values (p_key, p_receipt_hash, v_hash, v_phone_hash, 'SMOK-' || nextval('public.order_number_seq')::text, 'new', p_request->>'fulfillment',
    jsonb_build_object('name', v_name, 'phone', v_phone), v_address, v_preferred, p_request->>'notes', v_subtotal::integer, v_fee)
  returning id into v_order_id;
  insert into public.order_items(order_id, product_id, name, quantity, unit_price_grosz, image)
  select v_order_id, item->>'product_id', item->>'name', (item->>'quantity')::integer, (item->>'price')::integer, item->>'image'
  from jsonb_array_elements(v_items) item;
  return public.get_guest_order(p_key, p_receipt_hash);
end;
$$;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.get_guest_order(uuid, text) from public, anon, authenticated;
revoke all on function public.create_guest_order(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.get_guest_order(uuid, text), public.create_guest_order(uuid, text, jsonb) to service_role;
commit;
