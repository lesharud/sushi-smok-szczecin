-- One-time bootstrap only when exactly ONE Auth user exists.
-- Never choose an arbitrary account in a multi-user project.
begin;
do $$
declare v_user uuid;
begin
 if (select count(*) from auth.users) <> 1 then
   raise exception 'BOOTSTRAP_REQUIRES_EXACTLY_ONE_AUTH_USER';
 end if;
 select id into v_user from auth.users;
 if not exists (select 1 from auth.users where id=v_user and email_confirmed_at is not null and deleted_at is null) then
   raise exception 'BOOTSTRAP_REQUIRES_CONFIRMED_USER';
 end if;
 insert into public.staff_profiles(user_id,role,active) values(v_user,'admin',true)
 on conflict(user_id) do update set role='admin',active=true;
end;
$$;
commit;
select count(*) as active_admins from public.staff_profiles where role='admin' and active;
