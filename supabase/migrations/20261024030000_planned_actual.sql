begin;
-- Only the trusted trigger writes intervals. Owners can read their own intervals.
create table if not exists public.focus_segments(
 id bigint generated always as identity primary key,
 session_id uuid not null references public.focus_sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 started_at timestamptz not null, ended_at timestamptz,
 duration_ms bigint check(duration_ms>=0),
 check(ended_at is null or ended_at>=started_at)
);
alter table public.focus_segments enable row level security;
drop policy if exists segments_owner on public.focus_segments;
create policy segments_owner on public.focus_segments for select to authenticated using(user_id=auth.uid());
revoke all on public.focus_segments from public,anon,authenticated;
grant select on public.focus_segments to authenticated;
create unique index if not exists focus_segments_one_open on public.focus_segments(session_id) where ended_at is null;
create index if not exists focus_segments_owner_time on public.focus_segments(user_id,started_at,ended_at);
create index if not exists focus_sessions_owner_end on public.focus_sessions(user_id,ended_at,started_at);
create index if not exists schedules_owner_date on public.schedules(user_id,scheduled_date);
create or replace function public.record_focus_interval() returns trigger language plpgsql security definer set search_path='' as $$
declare delta bigint; begin
 if tg_op='INSERT' then
  if new.focus_status='running' and new.ended_at is null then insert into public.focus_segments(session_id,user_id,started_at) values(new.id,new.user_id,new.resumed_at); end if;
 elsif old.focus_status='running' and new.focus_status<>'running' then
  delta:=greatest(0,new.accumulated_ms-old.accumulated_ms);
  update public.focus_segments set ended_at=started_at+delta*interval '1 millisecond',duration_ms=delta where session_id=new.id and ended_at is null;
 elsif old.focus_status='paused' and new.focus_status='running' then
  insert into public.focus_segments(session_id,user_id,started_at) values(new.id,new.user_id,new.resumed_at);
 end if;
 return new;
end $$;
revoke all on function public.record_focus_interval() from public,anon,authenticated;
drop trigger if exists focus_interval_recorder on public.focus_sessions;
create trigger focus_interval_recorder after insert or update on public.focus_sessions for each row execute function public.record_focus_interval();
-- Open intervals can be recorded exactly from their current resume timestamp.
insert into public.focus_segments(session_id,user_id,started_at)
 select id,user_id,resumed_at from public.focus_sessions f where focus_status='running' and ended_at is null
 and not exists(select 1 from public.focus_segments s where s.session_id=f.id and s.ended_at is null);

-- Every local day is bounded by actual UTC instants, including 23/25-hour DST days.
create or replace function public.focus_daily(p_from date,p_to date)
returns table(day date,session_id uuid,kind text,project_id uuid,skill_id uuid,schedule_id uuid,seconds numeric)
language plpgsql stable security invoker set search_path='' as $$
declare zone text; begin
 if auth.uid() is null or p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 then raise exception 'Choose 1–366 days'; end if;
 zone:=coalesce((select timezone from public.profiles where user_id=auth.uid()),'America/Toronto');
 return query
 with dates as(select d::date as local_day,d::date::timestamp at time zone zone as lo,(d::date+1)::timestamp at time zone zone as hi from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d),
 sessions as(select f.*,case when f.session_kind='focus' then coalesce(f.duration_sec,0) else f.break_duration_sec end::numeric*1000 as target_ms
   from public.focus_sessions f where f.user_id=auth.uid() and f.focus_status='completed'
   and f.started_at<(p_to+1)::timestamp at time zone zone and f.ended_at>=p_from::timestamp at time zone zone),
 measured as(select f.id,coalesce(sum(s.duration_ms),0)::numeric as recorded_ms from sessions f left join public.focus_segments s on s.session_id=f.id and s.user_id=auth.uid() and s.ended_at is not null group by f.id),
 pieces as(
  select d.local_day as day,f.id,f.session_kind,f.project_id,f.skill_id,f.schedule_id,
   extract(epoch from (least(s.ended_at,d.hi)-greatest(s.started_at,d.lo)))*1000 * f.target_ms/greatest(m.recorded_ms,f.target_ms,1) as ms
  from sessions f join measured m on m.id=f.id join public.focus_segments s on s.session_id=f.id and s.user_id=auth.uid() and s.ended_at is not null
  join dates d on s.started_at<d.hi and s.ended_at>d.lo
  union all
  -- Legacy unrecorded intervals cannot be reconstructed: attribute the residual to start day.
  select (f.started_at at time zone zone)::date,f.id,f.session_kind,f.project_id,f.skill_id,f.schedule_id,greatest(0,f.target_ms-m.recorded_ms)
  from sessions f join measured m on m.id=f.id where (f.started_at at time zone zone)::date between p_from and p_to and f.target_ms>m.recorded_ms
 ) select p.day,p.id,p.session_kind,p.project_id,p.skill_id,p.schedule_id,sum(p.ms)/1000 from pieces p group by p.day,p.id,p.session_kind,p.project_id,p.skill_id,p.schedule_id;
end $$;
revoke all on function public.focus_daily(date,date) from public,anon;
grant execute on function public.focus_daily(date,date) to authenticated;

create or replace function public.analytics_report(p_from date,p_to date,p_offset integer default 0) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; zone text; actual_days jsonb; task_rows jsonb; project_rows jsonb; skill_rows jsonb; total_tasks integer; fit numeric; deferred integer; overdue integer; legacy integer; begin
 if auth.uid() is null or p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 or p_offset<0 then raise exception 'Choose 1–366 days'; end if;
 zone:=coalesce((select timezone from public.profiles where user_id=auth.uid()),'America/Toronto');
 with actual as materialized(select f.day,sum(f.seconds) filter(where f.kind='focus') as focus_seconds,sum(f.seconds) filter(where f.kind<>'focus') as break_seconds from public.focus_daily(p_from,p_to) f group by f.day),
 planned as(select scheduled_date as day,sum(estimated_minutes) as minutes from public.schedules where user_id=auth.uid() and deleted_at is null and scheduled_date between p_from and p_to group by scheduled_date),
 completed as(select (completed_at at time zone zone)::date as day,count(*) as total from public.schedules where user_id=auth.uid() and deleted_at is null and completed_at>=p_from::timestamp at time zone zone and completed_at<(p_to+1)::timestamp at time zone zone group by (completed_at at time zone zone)::date)
 select coalesce(jsonb_agg(to_jsonb(q) order by q.day),'[]') into actual_days from (
  select d::date as day,coalesce(a.focus_seconds,0) as focus_seconds,coalesce(a.break_seconds,0) as break_seconds,p.minutes as planned_minutes,coalesce(c.total,0) as completed_tasks
  from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day') d left join actual a on a.day=d::date left join planned p on p.day=d::date left join completed c on c.day=d::date
 )q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.seconds desc),'[]') into project_rows from(
  select f.project_id as id,coalesce(p.name,'Unassigned') as name,sum(f.seconds) as seconds
  from public.focus_daily(p_from,p_to) f left join public.projects p on p.id=f.project_id and p.user_id=auth.uid() where f.kind='focus' group by f.project_id,p.name
 )q;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.seconds desc),'[]') into skill_rows from(
  select f.skill_id as id,coalesce(s.name,'Unassigned') as name,sum(f.seconds) as seconds
  from public.focus_daily(p_from,p_to) f left join public.skills s on s.id=f.skill_id and s.user_id=auth.uid() where f.kind='focus' group by f.skill_id,s.name
 )q;
 with tasks as(select s.*, (select sum(f.duration_sec) from public.focus_sessions f where f.user_id=auth.uid() and f.schedule_id=s.id and f.session_kind='focus' and f.focus_status='completed' and f.duration_sec>0) as actual_seconds
  from public.schedules s where s.user_id=auth.uid() and s.deleted_at is null and (s.scheduled_date between p_from and p_to or (s.completed_at at time zone zone)::date between p_from and p_to))
 select count(*),sum(case when deferral_count>0 then 1 else 0 end),sum(case when not is_done and deadline<(clock_timestamp() at time zone zone)::date then 1 else 0 end),
  100.0*sum(least(estimated_minutes*60,actual_seconds)) filter(where is_done and estimated_minutes is not null and actual_seconds>0)/nullif(sum(greatest(estimated_minutes*60,actual_seconds)) filter(where is_done and estimated_minutes is not null and actual_seconds>0),0)
 into total_tasks,deferred,overdue,fit from tasks;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into task_rows from(
  select s.id,s.title,s.scheduled_date,s.deadline,s.estimated_minutes,s.is_done,s.deferral_count,
  (select sum(f.duration_sec) from public.focus_sessions f where f.user_id=auth.uid() and f.schedule_id=s.id and f.session_kind='focus' and f.focus_status='completed' and f.duration_sec>0) as actual_seconds
  from public.schedules s where s.user_id=auth.uid() and s.deleted_at is null and (s.scheduled_date between p_from and p_to or (s.completed_at at time zone zone)::date between p_from and p_to)
  order by s.scheduled_date nulls last,s.id limit 50 offset p_offset
 )q;
 select count(*) into legacy from public.focus_sessions f where f.user_id=auth.uid() and f.focus_status='completed'
 and (f.started_at at time zone zone)::date between p_from and p_to and (case when f.session_kind='focus' then coalesce(f.duration_sec,0) else f.break_duration_sec end)*1000>coalesce((select sum(s.duration_ms) from public.focus_segments s where s.session_id=f.id and s.ended_at is not null),0)+1;
 return jsonb_build_object('days',actual_days,'projects',project_rows,'skills',skill_rows,'tasks',task_rows,'task_count',total_tasks,
 'estimate_fit_percent',fit,'deferred_tasks',coalesce(deferred,0),'overdue_tasks',coalesce(overdue,0),'legacy_sessions',legacy);
end $$;
revoke all on function public.analytics_report(date,date,integer) from public,anon;
grant execute on function public.analytics_report(date,date,integer) to authenticated;

create or replace function public.task_focus_totals(p_ids uuid[]) returns table(schedule_id uuid,seconds bigint)
language sql stable security invoker set search_path='' as $$
 select f.schedule_id,sum(f.duration_sec)::bigint from public.focus_sessions f where f.user_id=auth.uid() and f.schedule_id=any(p_ids) and f.session_kind='focus' and f.focus_status='completed' group by f.schedule_id
$$;
revoke all on function public.task_focus_totals(uuid[]) from public,anon;
grant execute on function public.task_focus_totals(uuid[]) to authenticated;

create or replace function public.skill_focus_totals(p_from date,p_to date) returns table(skill_id uuid,total_sec bigint,session_count bigint,week_sec numeric)
language sql stable security invoker set search_path='' as $$
 select f.skill_id,sum(f.duration_sec)::bigint,count(*),(select coalesce(sum(d.seconds),0) from public.focus_daily(p_from,p_to) d where d.skill_id=f.skill_id and d.kind='focus')
 from public.focus_sessions f where f.user_id=auth.uid() and f.session_kind='focus' and f.focus_status='completed' group by f.skill_id
$$;
revoke all on function public.skill_focus_totals(date,date) from public,anon;
grant execute on function public.skill_focus_totals(date,date) to authenticated;

create or replace function public.project_focus_totals() returns table(project_id uuid,seconds bigint)
language sql stable security invoker set search_path='' as $$
 select f.project_id,sum(f.duration_sec)::bigint from public.focus_sessions f where f.user_id=auth.uid() and f.session_kind='focus' and f.focus_status='completed' group by f.project_id
$$;
revoke all on function public.project_focus_totals() from public,anon;
grant execute on function public.project_focus_totals() to authenticated;

create or replace function public.track_schedule_progress() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 new.deferral_count:=old.deferral_count+case when old.scheduled_date is not null and new.scheduled_date>old.scheduled_date then 1 else 0 end;
 new.completed_at:=case when new.is_done and not old.is_done then clock_timestamp() when new.is_done then old.completed_at else null end;
 return new;
end $$;
drop trigger if exists schedule_progress on public.schedules;
create trigger schedule_progress before update on public.schedules for each row execute function public.track_schedule_progress();
revoke all on function public.track_schedule_progress() from public,anon;
commit;
