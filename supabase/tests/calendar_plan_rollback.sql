-- TEST ONLY: roll back F2-B03 objects in a disposable PostgreSQL database.
-- Does not restore the unsafe edit_schedule grant and does not delete tasks,
-- focus history, profiles, or F2-B02's apply_schedule_batch RPC.
-- Production use requires a separately approved data-retention/backup plan.
begin;
drop trigger calendar_schedule_write_gate on public.schedules;
drop trigger calendar_focus_write_gate on public.focus_sessions;
drop trigger calendar_task_lock_write_gate on public.calendar_task_locks;
drop function public.calendar_owner_write_gate();
drop function public.undo_calendar_plan(uuid,uuid);
drop function public.confirm_calendar_draft(uuid,uuid);
drop function public.stage_calendar_draft(jsonb,jsonb,bigint);
drop table public.calendar_task_locks;
drop table public.calendar_plan_receipts;
drop table public.calendar_plan_drafts;
drop table public.calendar_plan_state;
-- Restore the earlier derived-field trigger logic exactly. This is a test
-- rollback; real production ledger retention requires separate authorization.
create or replace function public.track_schedule_progress()
returns trigger language plpgsql security invoker set search_path='' as $
begin
 new.deferral_count:=old.deferral_count+case when old.scheduled_date is not null and new.scheduled_date>old.scheduled_date then 1 else 0 end;
 new.completed_at:=case when new.is_done and not old.is_done then clock_timestamp() when new.is_done then old.completed_at else null end;
 return new;
end $;
commit;
