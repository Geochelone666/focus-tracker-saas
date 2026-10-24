begin;
alter table public.schedules add column if not exists deadline date;
alter table public.schedules add column if not exists deferral_count integer not null default 0 check(deferral_count>=0);
-- A single owner-scoped editor for forms, calendar moves, resizing and task operations.
create or replace function public.mutate_schedule(p_id uuid,p_expected timestamptz,p_patch jsonb,p_future boolean default false,p_revisions jsonb default '{}')
returns integer language plpgsql security invoker set search_path='' as $$
declare original public.schedules%rowtype; item public.schedules%rowtype; changed public.schedules%rowtype;
 count_changed integer:=0; zone text; key text; begin
 if auth.uid() is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Invalid schedule request'; end if;
 for key in select jsonb_object_keys(p_patch) loop
  if key not in ('title','scheduled_date','scheduled_time','notes','priority','estimated_minutes','energy','project_id','skill_id','deadline','is_done','deleted_at','deferral_reason') then raise exception 'Unsupported schedule field'; end if;
 end loop;
 select * into original from public.schedules where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Schedule not found'; end if;
 if p_expected is null or original.updated_at<>p_expected then raise exception 'Schedule changed on another device' using errcode='40001'; end if;
 if p_future and (original.is_done or original.deleted_at is not null or original.scheduled_date is null or (p_patch ? 'scheduled_date' and p_patch->>'scheduled_date' is null)) then raise exception 'Choose an open dated occurrence for future edits'; end if;
 zone:=coalesce((select timezone from public.profiles where user_id=auth.uid()),'America/Toronto');
 for item in select * from public.schedules where user_id=auth.uid() and
  (id=p_id or (p_future and original.series_id is not null and series_id=original.series_id and not is_done and deleted_at is null and scheduled_date>=original.scheduled_date)) order by id for update loop
  if item.id<>p_id and ((p_revisions->>item.id::text)::timestamptz is distinct from item.updated_at) then raise exception 'A future occurrence changed; reload the series' using errcode='40001'; end if;
  changed:=jsonb_populate_record(item,case when item.id=p_id then p_patch else p_patch-'deadline' end);
  if item.id<>p_id and p_patch ? 'scheduled_date' then changed.scheduled_date:=item.scheduled_date+(changed.scheduled_date-original.scheduled_date); end if;
  if changed.scheduled_date is not null and changed.scheduled_time is not null and
   (((changed.scheduled_date+changed.scheduled_time) at time zone zone) at time zone zone) <> changed.scheduled_date+changed.scheduled_time then raise exception 'This local time does not exist because clocks change. Choose another time.'; end if;
  update public.schedules set title=changed.title,scheduled_date=changed.scheduled_date,scheduled_time=changed.scheduled_time,notes=changed.notes,priority=changed.priority,
   estimated_minutes=changed.estimated_minutes,energy=changed.energy,project_id=changed.project_id,skill_id=changed.skill_id,deadline=changed.deadline,
   is_done=changed.is_done,deleted_at=changed.deleted_at,deferral_reason=changed.deferral_reason,
   completed_at=case when changed.is_done then coalesce(item.completed_at,clock_timestamp()) else null end,
   deferral_count=item.deferral_count+case when item.scheduled_date is not null and changed.scheduled_date>item.scheduled_date then 1 else 0 end
   where id=item.id and user_id=auth.uid();
  count_changed:=count_changed+1;
 end loop;
 return count_changed;
end $$;
revoke all on function public.mutate_schedule(uuid,timestamptz,jsonb,boolean,jsonb) from public,anon;
grant execute on function public.mutate_schedule(uuid,timestamptz,jsonb,boolean,jsonb) to authenticated;
-- Enforce DST-gap validation for every route, including legacy inserts and AI writes.
create or replace function public.guard_schedule_time() returns trigger language plpgsql security invoker set search_path='' as $$
declare zone text; begin
 if tg_op='UPDATE' and (new.scheduled_date,new.scheduled_time) is not distinct from (old.scheduled_date,old.scheduled_time) then return new; end if;
 zone:=coalesce((select timezone from public.profiles where user_id=new.user_id),'America/Toronto');
 if new.scheduled_date is not null and new.scheduled_time is not null and
  (((new.scheduled_date+new.scheduled_time) at time zone zone) at time zone zone)<>new.scheduled_date+new.scheduled_time then raise exception 'Local time skipped by DST'; end if;
 return new;
end $$;
drop trigger if exists schedule_time_guard on public.schedules;
create trigger schedule_time_guard before insert or update on public.schedules for each row execute function public.guard_schedule_time();
revoke all on function public.guard_schedule_time() from public,anon;
commit;
