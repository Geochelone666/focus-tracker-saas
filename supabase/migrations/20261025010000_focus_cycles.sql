-- Separate break accounting, bounded cycles and historical project attribution.
begin;
alter table public.focus_sessions
 add column if not exists session_kind text not null default 'focus' check(session_kind in ('focus','short_break','long_break')),
 add column if not exists break_duration_sec integer not null default 0 check(break_duration_sec>=0),
 add column if not exists cycle_number integer not null default 1 check(cycle_number between 1 and 12),
 add column if not exists cycle_count integer not null default 1 check(cycle_count between 1 and 12),
 add column if not exists short_break_seconds integer not null default 300 check(short_break_seconds between 60 and 3600),
 add column if not exists long_break_seconds integer not null default 900 check(long_break_seconds between 60 and 7200),
 add column if not exists long_break_every integer not null default 4 check(long_break_every between 1 and 12),
 add column if not exists cycle_focus_seconds integer,
 add column if not exists previous_session_id uuid unique references public.focus_sessions(id) on delete set null;
do $$ begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='focus_sessions' and column_name='project_id') then
  alter table public.focus_sessions add column project_id uuid references public.projects(id) on delete set null;
  update public.focus_sessions f set project_id=s.project_id from public.schedules s where f.schedule_id=s.id and f.user_id=s.user_id;
 end if;
end $$;
-- Existing historical project is inferred once from the task; new sessions snapshot at start.
create or replace function public.guard_focus_state() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  instant timestamptz := clock_timestamp();
  elapsed bigint;
  predecessor public.focus_sessions%rowtype;
begin
  if tg_op = 'INSERT' then
    if new.previous_session_id is not null then
      select * into predecessor from public.focus_sessions where id=new.previous_session_id and user_id=new.user_id;
      if not found or predecessor.focus_status<>'completed' then raise exception 'Invalid predecessor'; end if;
    end if;
    if new.previous_session_id is null and new.session_kind = 'focus' then new.cycle_focus_seconds := new.target_seconds; end if;
    if new.project_id is null and new.schedule_id is not null then
      select project_id into new.project_id from public.schedules where id=new.schedule_id and user_id=new.user_id;
    end if;
    -- Preserve supported historical imports; new active sessions always start running.
    new.focus_status := case when new.ended_at is null then 'running' else 'completed' end;
    new.resumed_at := case when new.ended_at is null then new.started_at else null end;
    new.accumulated_ms := case when new.ended_at is null then 0 else coalesce(new.duration_sec,0)::bigint * 1000 end;
    new.focus_revision := 0;
  else
    if (new.session_kind,new.cycle_number,new.cycle_count,new.short_break_seconds,new.long_break_seconds,new.long_break_every,new.cycle_focus_seconds,new.previous_session_id) is distinct from
       (old.session_kind,old.cycle_number,old.cycle_count,old.short_break_seconds,old.long_break_seconds,old.long_break_every,old.cycle_focus_seconds,old.previous_session_id) then raise exception 'Cycle configuration is immutable'; end if;
    if new.started_at is distinct from old.started_at or new.focus_mode is distinct from old.focus_mode
      or new.target_seconds is distinct from old.target_seconds then
      raise exception 'Session timing configuration is immutable';
    end if;
    -- An old client stopping a row must also use the authoritative clock/accounting.
    if old.ended_at is null and new.ended_at is not null and new.focus_status = old.focus_status then
      new.focus_status := 'completed';
    end if;
    if old.ended_at is not null then
      if new.ended_at is distinct from old.ended_at or new.duration_sec is distinct from old.duration_sec
        or new.focus_status is distinct from old.focus_status then raise exception 'Session already ended'; end if;
    elsif new.focus_status is distinct from old.focus_status then
      if new.focus_status = 'running' and old.focus_status <> 'paused' then raise exception 'Invalid resume'; end if;
      if new.focus_status = 'paused' and old.focus_status <> 'running' then raise exception 'Invalid pause'; end if;
      elapsed := old.accumulated_ms + case when old.focus_status = 'running'
        then greatest(0, floor(extract(epoch from (instant - old.resumed_at))*1000))::bigint else 0 end;
      if old.focus_mode = 'countdown' then elapsed := least(elapsed, old.target_seconds::bigint * 1000); end if;
      -- A request arriving after expiry finalizes, even if its requested action was pause/resume.
      if old.focus_mode = 'countdown' and elapsed >= old.target_seconds::bigint * 1000 and new.focus_status <> 'abandoned' then
        new.focus_status := 'completed';
      end if;
      new.accumulated_ms := elapsed;
      new.resumed_at := case when new.focus_status = 'running' then instant else null end;
      new.ended_at := case when new.focus_status in ('completed','abandoned') then greatest(instant,old.started_at) else null end;
      new.duration_sec := case when new.focus_status = 'abandoned' then 0
        when new.focus_status = 'completed' then floor(elapsed/1000.0)::integer else null end;
    else
      -- A metadata update must never reset time or inject completed duration.
      new.ended_at := old.ended_at;
      new.duration_sec := old.duration_sec;
      new.accumulated_ms := old.accumulated_ms;
      new.resumed_at := old.resumed_at;
    end if;
    if old.ended_at is not null then
      new.accumulated_ms := old.accumulated_ms; new.resumed_at := old.resumed_at;
    end if;
    new.focus_revision := old.focus_revision + 1;
    new.updated_at := instant;
  end if;
  new.break_duration_sec := case when new.session_kind <> 'focus' and new.focus_status='completed' then floor(new.accumulated_ms/1000.0)::integer else 0 end;
  if new.session_kind <> 'focus' then new.duration_sec := case when new.ended_at is null then null else 0 end; end if;
  if (new.focus_mode = 'countdown') <> (new.target_seconds is not null) then raise exception 'Countdown requires a target'; end if;
  return new;
end;
$$;

alter policy focus_sessions_insert_own on public.focus_sessions with check (
 auth.uid()=user_id
 and (skill_id is null or exists(select 1 from public.skills where id=focus_sessions.skill_id and user_id=auth.uid()))
 and (schedule_id is null or exists(select 1 from public.schedules where id=focus_sessions.schedule_id and user_id=auth.uid()))
 and (project_id is null or exists(select 1 from public.projects where id=focus_sessions.project_id and user_id=auth.uid()))
);
alter policy focus_sessions_update_own on public.focus_sessions with check (
 auth.uid()=user_id
 and (skill_id is null or exists(select 1 from public.skills where id=focus_sessions.skill_id and user_id=auth.uid()))
 and (schedule_id is null or exists(select 1 from public.schedules where id=focus_sessions.schedule_id and user_id=auth.uid()))
 and (project_id is null or exists(select 1 from public.projects where id=focus_sessions.project_id and user_id=auth.uid()))
);
create or replace function public.next_focus_phase(p_id uuid) returns public.focus_sessions
language plpgsql security invoker set search_path='' as $$
declare prior public.focus_sessions%rowtype; following public.focus_sessions%rowtype; kind text; target integer; begin
 select * into prior from public.focus_sessions where id=p_id and user_id=auth.uid() for update;
 if not found or prior.focus_status<>'completed' then raise exception 'Finish this phase before continuing'; end if;
 select * into following from public.focus_sessions where previous_session_id=p_id and user_id=auth.uid();
 if found then return following; end if;
 if prior.session_kind<>'focus' and prior.cycle_number>=prior.cycle_count then raise exception 'Cycle complete. Start a new focus when ready.'; end if;
 kind := case when prior.session_kind<>'focus' then 'focus' when prior.cycle_number % prior.long_break_every=0 then 'long_break' else 'short_break' end;
 target := case kind when 'focus' then prior.cycle_focus_seconds when 'long_break' then prior.long_break_seconds else prior.short_break_seconds end;
 insert into public.focus_sessions(user_id,skill_id,schedule_id,project_id,session_kind,focus_mode,target_seconds,cycle_focus_seconds,cycle_number,cycle_count,short_break_seconds,long_break_seconds,long_break_every,previous_session_id)
 values(auth.uid(),prior.skill_id,prior.schedule_id,prior.project_id,kind,case when target is null then 'elapsed' else 'countdown' end,target,prior.cycle_focus_seconds,
 prior.cycle_number+case when kind='focus' then 1 else 0 end,prior.cycle_count,prior.short_break_seconds,prior.long_break_seconds,prior.long_break_every,p_id) returning * into following;
 return following;
end $$;
revoke all on function public.next_focus_phase(uuid) from public,anon;
grant execute on function public.next_focus_phase(uuid) to authenticated;
commit;
