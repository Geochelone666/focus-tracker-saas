-- F2-B03: latest-revision-only inverse CAS; never blindly restore stale tasks.
begin;
create function public.undo_calendar_plan(p_receipt uuid,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid:=auth.uid();
  receipt public.calendar_plan_receipts%rowtype;
  revision bigint;
  zone text;
  prior jsonb;
  saved jsonb;
  task public.schedules%rowtype;
  after_stamp timestamptz;
  snapshot_count integer;
  next_revision bigint;
begin
  if owner_id is null or p_receipt is null or p_request is null then
    raise exception 'Authentication and IDs required' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,1029));
  select ps.revision into revision from public.calendar_plan_state ps
    where ps.user_id=owner_id for update;
  select * into receipt from public.calendar_plan_receipts
    where id=p_receipt and user_id=owner_id for update;
  if not found then raise exception 'Receipt unavailable' using errcode='42501'; end if;
  if receipt.status='undone' then
    if receipt.undo_request_id=p_request then
      return jsonb_build_object('receipt_id',receipt.id,'revision',receipt.undone_revision,'replay',true);
    end if;
    raise exception 'Plan already undone' using errcode='40001';
  end if;
  if exists(select 1 from public.calendar_plan_receipts r
    where r.user_id=owner_id and r.undo_request_id=p_request and r.id<>p_receipt) then
    raise exception 'Undo request ID already used' using errcode='22023';
  end if;
  if revision is distinct from receipt.confirmed_revision then
    raise exception 'A newer plan exists; cannot undo' using errcode='40001';
  end if;
  select z.name into zone from public.profiles p
    join pg_catalog.pg_timezone_names z on z.name=p.timezone
    where p.user_id=owner_id for share of p;
  if zone is distinct from (select timezone from public.calendar_plan_drafts d
                             where d.id=receipt.draft_id and d.user_id=owner_id) then
    raise exception 'Timezone changed since confirmation' using errcode='40001';
  end if;
  if exists(select 1 from public.focus_sessions f
    where f.user_id=owner_id and f.ended_at is null) then
    raise exception 'Active focus interval has no closed end' using errcode='23P01';
  end if;
  -- Mirror apply_schedule_batch: lock every open block, including all unaffected
  -- blocks, before inspecting the inverse calendar and individual CAS revisions.
  for task in
    select s.* from public.schedules s where s.user_id=owner_id
      and ((not s.is_done and s.deleted_at is null)
        or s.id in (select (x.value->>'id')::uuid
                    from jsonb_array_elements(receipt.after_rows) x(value)))
      order by s.id for update
  loop null; end loop;
  select count(*) into snapshot_count from jsonb_array_elements(receipt.after_rows);
  if snapshot_count=0 or snapshot_count<>jsonb_array_length(receipt.before_rows) then
    raise exception 'Invalid receipt snapshot' using errcode='22023';
  end if;
  for saved in select value from jsonb_array_elements(receipt.after_rows) x(value) loop
    select * into task from public.schedules s
      where s.user_id=owner_id and s.id=(saved->>'id')::uuid;
    if not found then raise exception 'Task unavailable' using errcode='42501'; end if;
    if task.is_done or task.deleted_at is not null
      or task.updated_at is distinct from (saved->>'updated_at')::timestamptz then
      raise exception 'Task changed after confirmation' using errcode='40001';
    end if;
    if exists(select 1 from public.calendar_task_locks l
      where l.user_id=owner_id and l.schedule_id=task.id) then
      raise exception 'Task locked after confirmation' using errcode='23P01';
    end if;
  end loop;
  -- Apply inverse through the existing revision-checked writer. One function
  -- call is one transaction; any failure rolls back EVERY inverse edit.
  for prior in select value from jsonb_array_elements(receipt.before_rows) x(value)
    order by (value->>'id')::uuid loop
    select (s.value->>'updated_at')::timestamptz into after_stamp
      from jsonb_array_elements(receipt.after_rows) s(value)
      where (s.value->>'id')::uuid=(prior->>'id')::uuid;
    if after_stamp is null then raise exception 'Invalid undo snapshot' using errcode='22023'; end if;
    perform public.mutate_schedule((prior->>'id')::uuid,after_stamp,
      jsonb_build_object('scheduled_date',prior->'scheduled_date',
                         'scheduled_time',prior->'scheduled_time',
                         'estimated_minutes',prior->'estimated_minutes'));
    -- mutate_schedule counts date postponements. A reversed draft is not a
    -- real deferral: restore the audited previous derived counter atomically.
    update public.schedules set deferral_count=(prior->>'deferral_count')::integer
      where id=(prior->>'id')::uuid and user_id=owner_id;
    if (select deferral_count from public.schedules
        where id=(prior->>'id')::uuid and user_id=owner_id)
       is distinct from (prior->>'deferral_count')::integer then
      raise exception 'Undo counter restoration failed: expected %, actual %, owner %',
        (prior->>'deferral_count')::integer,
        (select deferral_count from public.schedules
         where id=(prior->>'id')::uuid and user_id=owner_id),owner_id;
    end if;
  end loop;
  -- Re-check hard deadlines and collisions involving restored tasks after
  -- writing; failed validation aborts the entire inverse transaction.
  if exists(
    with selected as(
      select (x.value->>'id')::uuid id from jsonb_array_elements(receipt.before_rows) x(value)
    ), intervals as(
      select s.id,selected.id is not null as chosen,
        ((s.scheduled_date+s.scheduled_time) at time zone zone) as begins,
        ((s.scheduled_date+s.scheduled_time) at time zone zone)
          + s.estimated_minutes*interval '1 minute' as ends,
        s.deadline
      from public.schedules s left join selected on selected.id=s.id
      where s.user_id=owner_id and not s.is_done and s.deleted_at is null
        and s.scheduled_date is not null and s.scheduled_time is not null
        and s.estimated_minutes is not null
    )
    select 1 from intervals a join intervals b on a.id<b.id
    where (a.chosen or b.chosen)
      and a.begins<b.ends and b.begins<a.ends
  ) then raise exception 'Undo conflicts with another time block' using errcode='23P01';
  end if;
  if exists(
    select 1 from public.schedules s
    join jsonb_array_elements(receipt.before_rows) x(value) on s.id=(x.value->>'id')::uuid
    where s.user_id=owner_id and s.deadline is not null
      and s.scheduled_date is not null and s.scheduled_time is not null
      and s.estimated_minutes is not null
      and ((s.scheduled_date+s.scheduled_time) at time zone zone)
        + s.estimated_minutes*interval '1 minute'
        >public.local_day_start(s.deadline+1,zone)
  ) then raise exception 'Undo exceeds deadline' using errcode='22023';
  end if;
  next_revision:=revision+1;
  update public.calendar_plan_state set revision=next_revision where user_id=owner_id;
  update public.calendar_plan_receipts set status='undone',
    undo_request_id=p_request,undone_revision=next_revision,undone_at=clock_timestamp()
    where id=p_receipt and user_id=owner_id;
  return jsonb_build_object('receipt_id',receipt.id,'revision',next_revision,'replay',false);
end $$;
revoke all on function public.undo_calendar_plan(uuid,uuid) from public,anon,authenticated;
grant execute on function public.undo_calendar_plan(uuid,uuid) to authenticated;
commit;
