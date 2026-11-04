-- F2-B03: serialize legacy direct writes with scheduler's owner-scoped gate.
-- This prevents phantoms while a confirmation validates open task rows, locks,
-- and active-focus state. It does NOT revoke legacy table UPDATE privileges.
-- PostgreSQL may abort a competing multi-row writer with 40P01 (deadlock);
-- callers must re-read and retry with bounded backoff, never blind overwrite.
begin;
create function public.calendar_owner_write_gate()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid;
begin
  owner_id:=case when tg_op='DELETE' then old.user_id else new.user_id end;
  if tg_table_name='schedules' and tg_op='UPDATE'
    and (new.scheduled_date,new.scheduled_time,new.estimated_minutes,new.is_done,new.deleted_at)
      is not distinct from
      (old.scheduled_date,old.scheduled_time,old.estimated_minutes,old.is_done,old.deleted_at)
    then return new;
  end if;
  if tg_table_name='focus_sessions' and tg_op='UPDATE'
    and (new.focus_status,new.ended_at,new.schedule_id)
      is not distinct from (old.focus_status,old.ended_at,old.schedule_id)
    then return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,1029));
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger calendar_schedule_write_gate
  before insert or update on public.schedules
  for each row execute function public.calendar_owner_write_gate();
create trigger calendar_focus_write_gate
  before insert or update on public.focus_sessions
  for each row execute function public.calendar_owner_write_gate();
create trigger calendar_task_lock_write_gate
  before insert or delete on public.calendar_task_locks
  for each row execute function public.calendar_owner_write_gate();
revoke all on function public.calendar_owner_write_gate() from public,anon,authenticated;
commit;
