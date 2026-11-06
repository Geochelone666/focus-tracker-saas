-- Optional execution context; original estimates, focus history and completion are preserved.
begin;
alter table public.schedules add column remaining_minutes integer check(remaining_minutes between 1 and 1440);
alter table public.schedules add column resume_note text check(char_length(resume_note)<=2000);
create index focus_sessions_owner_task_started on public.focus_sessions(user_id,schedule_id,started_at desc);
create function public.save_task_recovery(p_id uuid,p_expected timestamptz,p_remaining integer,p_note text)
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare task public.schedules%rowtype; stamp timestamptz;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_expected is null or (p_remaining is not null and p_remaining not between 1 and 1440) or char_length(p_note)>2000 then
  raise exception 'Invalid recovery context' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,1029));
 select * into task from public.schedules where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Task unavailable' using errcode='42501'; end if;
 if task.updated_at is distinct from p_expected or task.is_done or task.deleted_at is not null then
  raise exception 'Task changed; reload' using errcode='40001'; end if;
 update public.schedules set remaining_minutes=p_remaining,resume_note=nullif(btrim(p_note),'')
 where id=p_id and user_id=auth.uid() returning updated_at into stamp;
 return stamp;
end $$;
create function public.task_recovery_snapshot(p_from date,p_to date,p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare rows jsonb; total bigint; zone text; begins timestamptz; finishes timestamptz;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 or p_offset is null or p_offset<0 or p_offset>100000 then
  raise exception 'Choose at most 31 days' using errcode='22023'; end if;
 select z.name into zone from public.profiles p join pg_catalog.pg_timezone_names z on z.name=p.timezone where p.user_id=auth.uid();
 if zone is null then raise exception 'Valid timezone required' using errcode='22023'; end if;
 begins:=public.local_day_start(p_from,zone); finishes:=public.local_day_start(p_to+1,zone);
 select count(*) into total from public.schedules s where s.user_id=auth.uid() and not s.is_done and s.deleted_at is null and (s.scheduled_date between p_from and p_to or exists(select 1 from public.focus_sessions recent where recent.user_id=auth.uid() and recent.schedule_id=s.id and recent.session_kind='focus' and (recent.ended_at is null or (recent.started_at<finishes and recent.ended_at>begins))));
 select coalesce(jsonb_agg(to_jsonb(result) order by result.scheduled_date,result.id),'[]'::jsonb) into rows from (
  select s.id,s.title,s.updated_at,s.scheduled_date,s.scheduled_time,s.estimated_minutes,s.remaining_minutes,s.resume_note,s.notes,s.skill_id,
   (select sum(f.duration_sec) from public.focus_sessions f where f.user_id=auth.uid() and f.schedule_id=s.id and f.session_kind='focus' and f.focus_status='completed') as actual_seconds,
   (select jsonb_build_object('status',f.focus_status,'note',f.note,'started_at',f.started_at,'ended_at',f.ended_at)
    from public.focus_sessions f where f.user_id=auth.uid() and f.schedule_id=s.id and f.session_kind='focus' order by f.started_at desc,f.id limit 1) as latest_session,
   (select f.focus_status from public.focus_sessions f where f.user_id=auth.uid() and f.schedule_id=s.id and f.ended_at is null limit 1) as active_status
  from public.schedules s where s.user_id=auth.uid() and not s.is_done and s.deleted_at is null and (s.scheduled_date between p_from and p_to or exists(select 1 from public.focus_sessions recent where recent.user_id=auth.uid() and recent.schedule_id=s.id and recent.session_kind='focus' and (recent.ended_at is null or (recent.started_at<finishes and recent.ended_at>begins))))
  order by s.scheduled_date,s.id limit 25 offset p_offset
 ) result;
 return jsonb_build_object('tasks',rows,'total',total,'captured_at',statement_timestamp());
end $$;
revoke all on function public.save_task_recovery(uuid,timestamptz,integer,text) from public,anon;
revoke all on function public.task_recovery_snapshot(date,date,integer) from public,anon;
grant execute on function public.save_task_recovery(uuid,timestamptz,integer,text) to authenticated;
grant execute on function public.task_recovery_snapshot(date,date,integer) to authenticated;
commit;
