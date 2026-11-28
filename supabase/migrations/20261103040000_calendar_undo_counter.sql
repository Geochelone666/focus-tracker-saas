-- F2-B03: preserve the original schedule_progress trigger's normal behavior,
-- but allow the trusted CAS undo function to restore the audit-snapshotted
-- derived deferral counter in a second UPDATE.
begin;
create or replace function public.track_schedule_progress()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  -- Authenticated clients may set custom PostgreSQL GUCs themselves, so the
  -- GUC alone is NOT authority. Only a postgres-owned SECURITY DEFINER
  -- transaction can restore an explicit prior audited value.
  if not (current_user='postgres'
          and current_setting('focus_calendar.undo_restore',true)='on') then
    new.deferral_count:=old.deferral_count
      +case when old.scheduled_date is not null and new.scheduled_date>old.scheduled_date
            then 1 else 0 end;
  elsif new.deferral_count<0 then
    raise exception 'Invalid undo deferral counter' using errcode='22023';
  end if;
  new.completed_at:=case
    when new.is_done and not old.is_done then clock_timestamp()
    when new.is_done then old.completed_at else null end;
  return new;
end $$;
-- Existing schedule_progress trigger remains attached to this function.
commit;
