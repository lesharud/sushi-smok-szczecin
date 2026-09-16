-- Durable, provider-independent outbox. No external network call in the order transaction.
begin;
create table public.notification_jobs (
 id uuid primary key default gen_random_uuid(),
 order_id uuid references public.orders(id),
 channel text not null check(channel in ('telegram','sms')),
 event text not null check(event in ('order_received','order_confirmed','order_ready','order_cancelled','delivery_started','test')),
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','expired')),
 attempts integer not null default 0 check(attempts between 0 and 8),
 available_at timestamptz not null default now(),
 locked_until timestamptz, lease_token uuid,
 created_at timestamptz not null default now(), sent_at timestamptz,
 expires_at timestamptz not null default (now()+interval '24 hours'),
 last_code text, provider_message_id text,
 unique(order_id,channel,event),
 check((event='test' and order_id is null) or (event<>'test' and order_id is not null))
);
create index notification_due_idx on public.notification_jobs(available_at,created_at) where status in ('pending','processing');
create table public.notification_attempts (
 id bigint generated always as identity primary key,
 job_id uuid not null references public.notification_jobs(id),
 attempt integer not null,
 outcome text not null check(outcome in ('sent','retry','failed','unknown')),
 code text not null check(code ~ '^[A-Z0-9_]{1,60}$'),
 created_at timestamptz not null default now()
);
create table public.notification_worker_state (
 id boolean primary key default true check(id), last_run_at timestamptz
);
insert into public.notification_worker_state(id) values(true);
alter table public.notification_jobs enable row level security;
alter table public.notification_attempts enable row level security;
alter table public.notification_worker_state enable row level security;
revoke all on public.notification_jobs, public.notification_attempts, public.notification_worker_state from public,anon,authenticated;
grant select on public.notification_jobs, public.notification_attempts, public.notification_worker_state to service_role;

create function public.enqueue_order_notifications() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_event text;
begin
 if TG_OP='INSERT' then v_event:='order_received';
 elsif new.status is distinct from old.status then
   v_event:=case new.status when 'accepted' then 'order_confirmed' when 'ready' then 'order_ready' when 'cancelled' then 'order_cancelled' end;
 end if;
 if v_event is not null then
  insert into public.notification_jobs(order_id,channel,event)
   values(new.id,'sms',v_event) on conflict do nothing;
  if v_event='order_received' then
   insert into public.notification_jobs(order_id,channel,event) values(new.id,'telegram',v_event) on conflict do nothing;
  end if;
 end if;
 return new;
end;
$$;
-- Existing orders are deliberately NOT backfilled; they must never produce a new-order alert.
create trigger orders_notification_outbox after insert or update of status on public.orders
for each row execute function public.enqueue_order_notifications();

create function public.claim_notification(p_channels text[]) returns setof public.notification_jobs
language plpgsql security definer set search_path='' as $$
declare v_job public.notification_jobs%rowtype;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('notification-claim',0)) then return; end if;
 update public.notification_worker_state set last_run_at=now() where id;
 update public.notification_jobs set status='expired',last_code='EXPIRED',lease_token=null,locked_until=null
 where status in ('pending','processing') and expires_at<=now() and (locked_until is null or locked_until<now());
 -- A crashed worker may have sent the message. Record uncertainty before bounded retry.
 insert into public.notification_attempts(job_id,attempt,outcome,code)
 select id,attempts,'unknown','LEASE_EXPIRED' from public.notification_jobs
 where status='processing' and locked_until<now();
 update public.notification_jobs set status=case when attempts>=8 then 'failed' else 'pending' end,
  last_code='LEASE_EXPIRED',lease_token=null,locked_until=null
 where status='processing' and locked_until<now();
 select * into v_job from public.notification_jobs
 where status='pending' and channel=any(p_channels) and available_at<=now() and attempts<8 and expires_at>now()
 order by created_at,id for update skip locked limit 1;
 if found then
  return query update public.notification_jobs set status='processing',attempts=attempts+1,
   locked_until=now()+interval '2 minutes',lease_token=gen_random_uuid()
   where id=v_job.id returning *;
 end if;
end;
$$;
create function public.finish_notification(p_id uuid,p_lease uuid,p_outcome text,p_code text,p_delay integer,p_message_id text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_job public.notification_jobs%rowtype;
begin
 if p_outcome not in ('sent','retry','failed','unknown') or p_outcome is null or p_code is null or p_code !~ '^[A-Z0-9_]{1,60}$'
  or p_delay is null or p_delay not between 1 and 86400 or char_length(p_message_id)>100 then raise exception 'INVALID_NOTIFICATION_RESULT'; end if;
 select * into v_job from public.notification_jobs where id=p_id and lease_token=p_lease and status='processing' and locked_until>now() for update;
 if not found then return false; end if;
 insert into public.notification_attempts(job_id,attempt,outcome,code) values(p_id,v_job.attempts,p_outcome,p_code);
 update public.notification_jobs set status=case when p_outcome='sent' then 'sent' when p_outcome='failed' or attempts>=8 then 'failed' else 'pending' end,
  last_code=p_code,available_at=now()+make_interval(secs=>p_delay),lease_token=null,locked_until=null,
  sent_at=case when p_outcome='sent' then now() else null end,provider_message_id=p_message_id
 where id=p_id;
 return true;
end;
$$;
-- Global 60-second rate limit across all admins and Vercel instances; fixed test content only.
create function public.enqueue_notification_test() returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('notification-test',0));
 if exists(select 1 from public.notification_jobs where event='test' and created_at>now()-interval '60 seconds') then raise exception 'RATE_LIMITED'; end if;
 insert into public.notification_jobs(channel,event,expires_at) values('telegram','test',now()+interval '10 minutes') returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.enqueue_order_notifications(),public.claim_notification(text[]),public.finish_notification(uuid,uuid,text,text,integer,text),public.enqueue_notification_test() from public,anon,authenticated;
grant execute on function public.claim_notification(text[]),public.finish_notification(uuid,uuid,text,text,integer,text),public.enqueue_notification_test() to service_role;
commit;
