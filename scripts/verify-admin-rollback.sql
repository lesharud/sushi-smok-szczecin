-- Cloud authorization/mutation checks inside ONE rolled-back transaction.
-- No business values, roles or existing orders remain changed after completion.
begin;
set local statement_timeout='10s';
do $$ begin
 perform set_config('request.jwt.claim.sub',(select user_id::text from public.staff_profiles where role='admin' and active order by created_at limit 1),true);
 if auth.uid() is null then raise exception 'ADMIN_REQUIRED_FOR_TEST'; end if;
end $$;
set local role authenticated;
do $$
declare p public.products%rowtype; s public.order_settings%rowtype;
begin
 if public.staff_role() is distinct from 'admin' then raise exception 'ADMIN_ROLE_TEST_FAILED'; end if;
 select * into p from public.products order by id limit 1;
 perform public.admin_update_product(p.id,p.updated_at,p.name,p.description,p.category_id,p.price_grosz+1,not p.available);
 if not exists(select 1 from public.products where id=p.id and price_grosz=p.price_grosz+1 and available=not p.available) then raise exception 'PRODUCT_WRITE_TEST_FAILED'; end if;
 select * into s from public.order_settings where id;
 perform public.admin_update_settings(s.updated_at,not s.ordering_enabled,s.delivery_enabled,s.delivery_fee_grosz);
 if not exists(select 1 from public.order_settings where ordering_enabled=not s.ordering_enabled) then raise exception 'SETTINGS_WRITE_TEST_FAILED'; end if;
end $$;
reset role;
update public.staff_profiles set role='staff' where user_id=auth.uid();
set local role authenticated;
do $$ begin
 if public.staff_role() is distinct from 'staff' then raise exception 'STAFF_ROLE_TEST_FAILED'; end if;
 begin
  perform public.admin_update_settings(null,true,false,null);
  raise exception 'STAFF_WRITE_UNEXPECTEDLY_ALLOWED';
 exception when insufficient_privilege then null;
 end;
 if (select count(*) from public.products)>0 then raise exception 'STAFF_MENU_UNEXPECTEDLY_VISIBLE'; end if;
end $$;
reset role;
update public.staff_profiles set active=false where user_id=auth.uid();
set local role authenticated;
do $$ begin
 if (select count(*) from public.orders)>0 or (select count(*) from public.order_items)>0 then raise exception 'REVOKED_STAFF_READ_ALLOWED'; end if;
 begin
  perform public.staff_change_order_status(gen_random_uuid(),'new','accepted');
  raise exception 'REVOKED_STAFF_WRITE_ALLOWED';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
select true as rollback_checks_passed;

-- Availability must reject even an old client cart. This expected failure creates no order.
begin;
set local statement_timeout='10s';
do $$
declare v_id text;
begin
 select id into v_id from public.products where available order by id limit 1;
 if v_id is null then raise exception 'NO_AVAILABLE_PRODUCT_FOR_CHECK'; end if;
 update public.products set available=false where id=v_id;
 begin
  perform public.create_guest_order(gen_random_uuid(),repeat('a',64),jsonb_build_object(
   'items',jsonb_build_array(jsonb_build_object('productId',v_id,'quantity',1)),
   'customer',jsonb_build_object('name','Integration test','phone','500111999'),
   'fulfillment','pickup','address',null,'notes','ROLLBACK AVAILABILITY TEST','preferredTime',null));
  raise exception 'UNAVAILABLE_PRODUCT_ACCEPTED';
 exception when raise_exception then
  if sqlerrm <> 'PRODUCT_UNAVAILABLE' then raise; end if;
 end;
end $$;
rollback;
select true as unavailable_product_rejected_without_persistent_changes;
