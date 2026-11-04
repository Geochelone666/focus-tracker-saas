-- Read-only, bounded, statement-consistent owner snapshot for the experimental UI.
begin;
create function public.calendar_preview_snapshot() returns jsonb
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
  'locked_ids',coalesce((select jsonb_agg(l.schedule_id order by l.schedule_id)
    from public.calendar_task_locks l join tasks t on t.id=l.schedule_id where l.user_id=o.id),'[]'::jsonb)
) from owner o where o.id is not null;
$$;
revoke all on function public.calendar_preview_snapshot() from public,anon;
grant execute on function public.calendar_preview_snapshot() to authenticated;

-- Keep the preview's timezone bound to staging under the same profile row lock.
create function public.stage_calendar_preview(p_changes jsonb,p_availability jsonb,p_base_revision bigint,p_timezone text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare zone text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select timezone into zone from public.profiles where user_id=auth.uid() for share;
  if zone is distinct from p_timezone then raise exception 'Timezone changed; regenerate preview' using errcode='40001'; end if;
  return public.stage_calendar_draft(p_changes,p_availability,p_base_revision);
end $$;
revoke all on function public.stage_calendar_preview(jsonb,jsonb,bigint,text) from public,anon;
grant execute on function public.stage_calendar_preview(jsonb,jsonb,bigint,text) to authenticated;
commit;
