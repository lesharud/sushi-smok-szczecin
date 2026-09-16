-- Stage 2: additive migration. Never reset production or rerun the catalog seed.
begin;
create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.staff_profiles enable row level security;
revoke all on public.staff_profiles from public, anon, authenticated;
grant select on public.staff_profiles to authenticated;
grant select, insert, update, delete on public.staff_profiles to service_role;
create policy staff_read_self on public.staff_profiles for select to authenticated using (user_id = (select auth.uid()));
-- Lookup from the table on every request, not from user-editable JWT metadata.
create function public.staff_role() returns text language sql stable security definer set search_path = '' as $$
 select role from public.staff_profiles where user_id = auth.uid() and active;
$$;
revoke all on function public.staff_role() from public, anon;
grant execute on function public.staff_role() to authenticated;

-- Remove obsolete customer/catalog policies before restoring authenticated reads.
drop policy if exists own_orders_read on public.orders;
drop policy if exists own_items_read on public.order_items;
drop policy if exists catalog_products_read on public.products;
drop policy if exists catalog_categories_read on public.categories;
-- Restrictive guards also prevent any surviving permissive legacy policy from bypassing staff checks.
create policy staff_orders_guard on public.orders as restrictive for select to authenticated using ((select public.staff_role()) in ('admin','staff'));
create policy staff_items_guard on public.order_items as restrictive for select to authenticated using ((select public.staff_role()) in ('admin','staff'));
create policy admin_products_guard on public.products as restrictive for select to authenticated using ((select public.staff_role()) = 'admin');
create policy admin_categories_guard on public.categories as restrictive for select to authenticated using ((select public.staff_role()) = 'admin');
create policy admin_settings_guard on public.order_settings as restrictive for select to authenticated using ((select public.staff_role()) = 'admin');
-- Reads are explicitly column-scoped: receipt/idempotency hashes are never exposed.
grant select (id,number,status,fulfillment,customer,address,preferred_time,notes,subtotal_grosz,delivery_fee_grosz,total_grosz,created_at,updated_at) on public.orders to authenticated;
grant select (id,order_id,product_id,name,quantity,unit_price_grosz,line_total_grosz,image) on public.order_items to authenticated;
grant select on public.products, public.categories, public.order_settings to authenticated;
create policy staff_orders_read on public.orders for select to authenticated using ((select public.staff_role()) in ('admin','staff'));
create policy staff_items_read on public.order_items for select to authenticated using ((select public.staff_role()) in ('admin','staff'));
create policy admin_products_read on public.products for select to authenticated using ((select public.staff_role()) = 'admin');
create policy admin_categories_read on public.categories for select to authenticated using ((select public.staff_role()) = 'admin');
create policy admin_settings_read on public.order_settings for select to authenticated using ((select public.staff_role()) = 'admin');
-- No direct INSERT/UPDATE/DELETE grants. All mutations use narrow transactional RPCs.
create table public.order_status_events (
 id bigint generated always as identity primary key,
 order_id uuid not null references public.orders(id),
 actor_id uuid references auth.users(id) on delete set null,
 previous_status text not null, next_status text not null,
 created_at timestamptz not null default now()
);
alter table public.order_status_events enable row level security;
revoke all on public.order_status_events from public, anon, authenticated;
grant select on public.order_status_events to service_role;
create index order_status_events_order_idx on public.order_status_events(order_id,created_at);
create index orders_created_idx on public.orders(created_at desc, id);

create function public.staff_change_order_status(p_id uuid, p_expected text, p_next text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
 if public.staff_role() is null then raise exception 'STAFF_REQUIRED' using errcode='42501'; end if;
 select status into v_status from public.orders where id=p_id for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if v_status is distinct from p_expected then raise exception 'STALE_WRITE'; end if;
 if not ((v_status='new' and p_next='accepted') or (v_status='accepted' and p_next='preparing')
   or (v_status='preparing' and p_next='ready') or (v_status='ready' and p_next='delivered')
   or (v_status in ('new','accepted','preparing','ready') and p_next='cancelled')) or p_next is null then
   raise exception 'INVALID_TRANSITION';
 end if;
 update public.orders set status=p_next where id=p_id;
 insert into public.order_status_events(order_id,actor_id,previous_status,next_status) values(p_id,auth.uid(),v_status,p_next);
end;
$$;

create function public.admin_update_product(p_id text, p_expected timestamptz, p_name text, p_description text, p_category text, p_price integer, p_available boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if public.staff_role() is distinct from 'admin' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 150 or p_description is null or char_length(p_description)>4000
   or p_price is null or p_price not between 0 and 1000000 or p_available is null or p_category is null
   or not exists(select 1 from public.categories where id=p_category) then raise exception 'INVALID_PRODUCT'; end if;
 update public.products set name=btrim(p_name),description=p_description,category_id=p_category,price_grosz=p_price,available=p_available
 where id=p_id and updated_at=p_expected;
 if not found then raise exception 'STALE_WRITE'; end if;
end;
$$;

create function public.admin_update_settings(p_expected timestamptz, p_ordering boolean, p_delivery boolean, p_fee integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if public.staff_role() is distinct from 'admin' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_ordering is null or p_delivery is null or (p_delivery and p_fee is null) or (p_fee is not null and p_fee not between 0 and 100000) then raise exception 'INVALID_SETTINGS'; end if;
 update public.order_settings set ordering_enabled=p_ordering,delivery_enabled=p_delivery,delivery_fee_grosz=p_fee where id=true and updated_at=p_expected;
 if not found then raise exception 'STALE_WRITE'; end if;
end;
$$;
revoke all on function public.staff_change_order_status(uuid,text,text), public.admin_update_product(text,timestamptz,text,text,text,integer,boolean), public.admin_update_settings(timestamptz,boolean,boolean,integer) from public, anon;
grant execute on function public.staff_change_order_status(uuid,text,text), public.admin_update_product(text,timestamptz,text,text,text,integer,boolean), public.admin_update_settings(timestamptz,boolean,boolean,integer) to authenticated;
commit;
