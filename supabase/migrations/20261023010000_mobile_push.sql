begin;
create table if not exists public.push_devices (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 expo_token text unique check (char_length(expo_token)<=256 and expo_token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'),
 platform text not null check (platform in ('ios','android','web')),
 transport text not null default 'expo' check (transport in ('expo','web')),
 web_subscription jsonb,
 check ((transport='expo' and expo_token is not null and web_subscription is null and platform in ('ios','android')) or (transport='web' and expo_token is null and platform='web' and jsonb_typeof(web_subscription)='object' and char_length(web_subscription::text)<=4096 and web_subscription->>'endpoint' is not null)),
 name text not null default 'My phone' check (char_length(name) between 1 and 80),
 lead_minutes integer not null default 10 check (lead_minutes in (0,5,10,15,30,60)),
 enabled boolean not null default true, last_test_at timestamptz, last_seen_at timestamptz not null default now(), created_at timestamptz not null default now()
);
-- Bound registrations even when a caller bypasses the application API.
create or replace function public.limit_push_devices() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
 if (select count(*) from public.push_devices where user_id=new.user_id and id<>new.id)>=10 then
  raise exception 'At most 10 phones can be registered per account';
 end if;
 return new;
end $$;
drop trigger if exists limit_push_devices on public.push_devices;
create trigger limit_push_devices before insert or update of user_id on public.push_devices for each row execute function public.limit_push_devices();
create unique index if not exists push_web_endpoint_idx on public.push_devices((web_subscription->>'endpoint')) where transport='web';
alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon, authenticated;
grant select,insert,update,delete on public.push_devices to authenticated;
grant all on public.push_devices to service_role;
drop policy if exists push_devices_own on public.push_devices;
create policy push_devices_own on public.push_devices for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

create table if not exists public.push_deliveries (
 id uuid primary key default gen_random_uuid(), device_id uuid not null references public.push_devices(id) on delete cascade,
 schedule_id uuid not null references public.schedules(id) on delete cascade, scheduled_at timestamptz not null,
 state text not null default 'retry' check (state in ('sending','retry','ticketed','sent','failed')),
 attempts integer not null default 0, lease_id uuid not null default gen_random_uuid(), lease_until timestamptz not null default now(),
 ticket_id text, token_sent text, ticketed_at timestamptz, receipt_checked_at timestamptz,
 error_code text, created_at timestamptz not null default now(),
 unique(device_id,schedule_id,scheduled_at)
);
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon, authenticated;
grant all on public.push_deliveries to service_role;
create index if not exists push_receipts_idx on public.push_deliveries(state,ticketed_at);
create index if not exists push_devices_owner_idx on public.push_devices(user_id);
create index if not exists schedules_push_idx on public.schedules(scheduled_date) where not is_done and deleted_at is null and scheduled_time is not null;

-- Definer functions are callable ONLY by the server role, never by AI keys or users.
create or replace function public.claim_push_reminders(p_now timestamptz default now(), p_limit integer default 100)
returns table(delivery_id uuid,lease_id uuid,expo_token text,schedule_id uuid,scheduled_at timestamptz,web_subscription jsonb)
language sql security definer set search_path='' as $$
 with candidates as (
  select d.id device_id,s.id schedule_id,x.starts_at,d.expo_token
  from public.push_devices d join public.schedules s on s.user_id=d.user_id
  left join public.profiles p on p.user_id=d.user_id
  left join pg_catalog.pg_timezone_names z on z.name=p.timezone
  cross join lateral (select (s.scheduled_date+s.scheduled_time) at time zone coalesce(z.name,'America/Toronto') starts_at) x
  left join public.push_deliveries old on old.device_id=d.id and old.schedule_id=s.id and old.scheduled_at=x.starts_at
  where d.enabled and d.last_seen_at > p_now-interval '30 days' and not s.is_done and s.deleted_at is null
   and s.scheduled_date is not null and s.scheduled_time is not null
   and s.scheduled_date between (p_now at time zone 'UTC')::date-2 and (p_now at time zone 'UTC')::date+2
   -- Reject nonexistent spring-forward wall times. Ambiguous fall-back times use PostgreSQL's standard-time occurrence.
   and (x.starts_at at time zone coalesce(z.name,'America/Toronto'))=s.scheduled_date+s.scheduled_time
   and x.starts_at >= p_now-interval '1 minute'
   and x.starts_at-make_interval(mins=>d.lead_minutes) <= p_now
   and x.starts_at-make_interval(mins=>d.lead_minutes) > p_now-interval '5 minutes'
   and (old.id is null or (old.state in ('retry','sending') and old.attempts<3 and old.lease_until<=p_now))
  order by x.starts_at,d.id,s.id limit least(greatest(p_limit,1),100)
 ), claimed as (
  insert into public.push_deliveries as target(device_id,schedule_id,scheduled_at,state,attempts,lease_id,lease_until)
  select device_id,schedule_id,starts_at,'sending',1,gen_random_uuid(),p_now+interval '2 minutes' from candidates
  on conflict (device_id,schedule_id,scheduled_at) do update set state='sending',attempts=target.attempts+1,lease_id=gen_random_uuid(),lease_until=p_now+interval '2 minutes'
   where target.state in ('retry','sending') and target.attempts<3 and target.lease_until<=p_now
  returning target.id,target.lease_id,target.device_id,target.schedule_id,target.scheduled_at
 ) select c.id,c.lease_id,d.expo_token,c.schedule_id,c.scheduled_at,d.web_subscription from claimed c join public.push_devices d on d.id=c.device_id;
$$;
revoke all on function public.claim_push_reminders(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.claim_push_reminders(timestamptz,integer) to service_role;

-- Re-check ownership, completion and schedule timing immediately before network send.
create or replace function public.check_push_delivery(p_id uuid,p_lease uuid,p_now timestamptz default now())
returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.push_deliveries q join public.push_devices d on d.id=q.device_id
 join public.schedules s on s.id=q.schedule_id and s.user_id=d.user_id
 left join public.profiles p on p.user_id=d.user_id left join pg_catalog.pg_timezone_names z on z.name=p.timezone
 where q.id=p_id and q.lease_id=p_lease and q.state='sending' and q.lease_until>p_now
 and d.enabled and d.last_seen_at>p_now-interval '30 days' and not s.is_done and s.deleted_at is null
 and (s.scheduled_date+s.scheduled_time) at time zone coalesce(z.name,'America/Toronto')=q.scheduled_at
 and q.scheduled_at>=p_now-interval '1 minute'
 and q.scheduled_at-make_interval(mins=>d.lead_minutes)<=p_now
 and q.scheduled_at-make_interval(mins=>d.lead_minutes)>p_now-interval '5 minutes');
$$;
revoke all on function public.check_push_delivery(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.check_push_delivery(uuid,uuid,timestamptz) to service_role;

-- Cleanup is bounded by the administrator's minute scheduler; no private content is retained here.
create or replace function public.cleanup_push_history() returns void language sql security definer set search_path='' as $$
 delete from public.push_deliveries where created_at < now()-interval '30 days';
$$;
revoke all on function public.cleanup_push_history() from public,anon,authenticated;
grant execute on function public.cleanup_push_history() to service_role;
commit;
