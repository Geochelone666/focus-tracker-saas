-- Keep pending reminders eligible until their plan starts, even if a scheduler tick was missed.
-- Existing unique delivery key prevents duplicate sends.
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
   and x.starts_at >= p_now-interval '1 minute'
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
 and q.scheduled_at>=p_now-interval '1 minute');
$$;
revoke all on function public.check_push_delivery(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.check_push_delivery(uuid,uuid,timestamptz) to service_role;

