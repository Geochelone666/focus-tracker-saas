-- Focus V1: retain history and the existing ended_at IS NULL uniqueness index.
begin;
alter table public.focus_sessions
  add column if not exists focus_mode text not null default 'elapsed' check (focus_mode in ('elapsed','countdown')),
  add column if not exists target_seconds integer check (target_seconds between 60 and 86400),
  add column if not exists focus_status text not null default 'running' check (focus_status in ('running','paused','completed','abandoned')),
  add column if not exists accumulated_ms bigint not null default 0 check (accumulated_ms >= 0),
  add column if not exists resumed_at timestamptz,
  add column if not exists focus_revision integer not null default 0 check (focus_revision >= 0);
-- Only initialize rows not yet initialized. Completed legacy duration is untouched.
update public.focus_sessions set focus_status = 'completed', accumulated_ms = coalesce(duration_sec,0)::bigint * 1000
  where ended_at is not null and focus_status = 'running';
update public.focus_sessions set resumed_at = started_at
  where ended_at is null and focus_status = 'running' and resumed_at is null;

create or replace function public.guard_focus_state() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  instant timestamptz := clock_timestamp();
  elapsed bigint;
begin
  if tg_op = 'INSERT' then
    -- Preserve supported historical imports; new active sessions always start running.
    new.focus_status := case when new.ended_at is null then 'running' else 'completed' end;
    new.resumed_at := case when new.ended_at is null then new.started_at else null end;
    new.accumulated_ms := case when new.ended_at is null then 0 else coalesce(new.duration_sec,0)::bigint * 1000 end;
    new.focus_revision := 0;
  else
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
  if (new.focus_mode = 'countdown') <> (new.target_seconds is not null) then raise exception 'Countdown requires a target'; end if;
  return new;
end;
$$;
drop trigger if exists focus_state_guard on public.focus_sessions;
create trigger focus_state_guard before insert or update on public.focus_sessions
for each row execute function public.guard_focus_state();

-- Row locking serializes two devices; revision rejects stale intent. Invoker retains owner RLS.
create or replace function public.transition_focus(p_id uuid, p_revision integer, p_action text, p_note text default null, p_skill uuid default null)
returns public.focus_sessions language plpgsql security invoker set search_path = '' as $$
declare
  session public.focus_sessions%rowtype;
  desired text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  desired := case p_action when 'pause' then 'paused' when 'resume' then 'running'
    when 'complete' then 'completed' when 'abandon' then 'abandoned' end;
  if desired is null or (p_note is not null and char_length(p_note) > 200) then raise exception 'Invalid focus request'; end if;
  select * into session from public.focus_sessions where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Session not found'; end if;
  -- Repeated saves never alter the first result or its note.
  if session.focus_status = desired then return session; end if;
  if session.ended_at is not null or session.focus_revision <> p_revision or p_revision is null then
    raise exception 'Session changed on another device. Refresh before trying again.' using errcode = '40001';
  end if;
  update public.focus_sessions set focus_status = desired,
    note = case when desired = 'completed' then nullif(btrim(p_note),'') else note end,
    skill_id = case when desired = 'completed' then coalesce(p_skill,skill_id) else skill_id end
    where id = p_id and user_id = auth.uid() returning * into session;
  return session;
end;
$$;
revoke all on function public.transition_focus(uuid,integer,text,text,uuid) from public, anon;
grant execute on function public.transition_focus(uuid,integer,text,text,uuid) to authenticated;
revoke all on function public.guard_focus_state() from public, anon;
commit;
