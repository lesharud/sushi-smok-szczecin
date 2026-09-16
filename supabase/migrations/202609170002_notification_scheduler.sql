-- Supabase-hosted scheduler: no paid Vercel Cron dependency.
-- No HTTP requests are made until a worker secret is deliberately installed in Vault.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
create function public.wake_notification_worker() returns void
language plpgsql security definer set search_path='' as $$
declare v_secret text;
begin
 select decrypted_secret into v_secret from vault.decrypted_secrets where name='sushi_notification_worker_secret';
 if v_secret is null or char_length(v_secret)<32 then return; end if;
 perform net.http_post(
  url:='https://sushi-smok-szczecin.vercel.app/api/notification-worker',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_secret),
  body:='{}'::jsonb,timeout_milliseconds:=60000
 );
end;
$$;
revoke all on function public.wake_notification_worker() from public,anon,authenticated,service_role;
select cron.schedule('sushi-notifications','* * * * *','select public.wake_notification_worker()');
commit;
