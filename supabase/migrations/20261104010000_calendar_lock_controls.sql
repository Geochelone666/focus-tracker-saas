-- Exact-revision user lock control; no task times or user grants are changed.
begin;
create or replace function public.calendar_preview_snapshot() returns jsonb
language sql stable security invoker set search_path='' as $$
with owner as (select auth.uid() as id),
tasks as materialized (
  select s.* from public.schedules s, owner o
  where s.user_id=o.id and not s.is_done and s.deleted_at is null order by s.id limit 501
), receipts as materialized (
  select r.* from public.calendar_plan_receipts r,owner o
  where r.user_id=o.id order by r.confirmed_revision desc limit 200
), accepted as (
  select distinct on (s.id) s.id, r.id as receipt_id
  from tasks s join receipts r on r.status='confirmed'
  cross join lateral jsonb_array_elements(r.after_rows) a
  where (a->>'id')::uuid=s.id and (a->>'updated_at')::timestamptz=s.updated_at
  order by s.id,r.confirmed_revision desc
)
select jsonb_build_object(
  'user_id',o.id,'captured_at',statement_timestamp(),
  'timezone',(select p.timezone from public.profiles p where p.user_id=o.id),
  'revision',coalesce((select s.revision::text from public.calendar_plan_state s where s.user_id=o.id),'0'),
  'version_id',(select r.id from receipts r order by r.confirmed_revision desc limit 1),
  'undo_receipt_id',(select r.id from receipts r join public.calendar_plan_state s
    on s.user_id=r.user_id and s.revision=r.confirmed_revision where r.status='confirmed' limit 1),
  'has_active_focus',exists(select 1 from public.focus_sessions f where f.user_id=o.id and f.ended_at is null),
  'schedules',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from tasks t),'[]'::jsonb),
  'accepted_ids',coalesce((select jsonb_agg(a.id order by a.id) from accepted a),'[]'::jsonb),
  'lock_versions',coalesce((select jsonb_object_agg(l.schedule_id,l.created_at) from public.calendar_task_locks l join tasks t on t.id=l.schedule_id where l.user_id=o.id),'{}'::jsonb),
  'locked_ids',coalesce((select jsonb_agg(l.schedule_id order by l.schedule_id)
    from public.calendar_task_locks l join tasks t on t.id=l.schedule_id where l.user_id=o.id),'[]'::jsonb)
) from owner o where o.id is not null;
$$;
revoke all on function public.calendar_preview_snapshot() from public,anon;
grant execute on function public.calendar_preview_snapshot() to authenticated;


create function public.set_calendar_task_lock(p_id uuid,p_expected timestamptz,p_expected_lock timestamptz,p_locked boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid(); task public.schedules%rowtype; lock_stamp timestamptz;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_locked is null or p_expected is null then raise exception 'Expected state required' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,1029));
 select * into task from public.schedules where id=p_id and user_id=owner_id for update;
 if not found then raise exception 'Task unavailable' using errcode='42501'; end if;
 if task.is_done or task.deleted_at is not null or task.updated_at is distinct from p_expected then
   raise exception 'Task changed; reload plan' using errcode='40001'; end if;
 select created_at into lock_stamp from public.calendar_task_locks where schedule_id=p_id and user_id=owner_id;
 if lock_stamp is distinct from p_expected_lock then
   raise exception 'Task lock changed; reload plan' using errcode='40001'; end if;
 if p_locked and lock_stamp is null then
   insert into public.calendar_task_locks(schedule_id,user_id,created_at) values(p_id,owner_id,clock_timestamp()) returning created_at into lock_stamp;
 elsif not p_locked and lock_stamp is not null then
   delete from public.calendar_task_locks where schedule_id=p_id and user_id=owner_id;
   lock_stamp:=null;
 end if;
 return jsonb_build_object('locked',p_locked,'lock_version',lock_stamp);
end $$;
revoke all on function public.set_calendar_task_lock(uuid,timestamptz,timestamptz,boolean) from public,anon;
grant execute on function public.set_calendar_task_lock(uuid,timestamptz,timestamptz,boolean) to authenticated;
commit;
