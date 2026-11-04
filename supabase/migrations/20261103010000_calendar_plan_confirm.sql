-- F2-B03: version-bound preview staging, atomic conditional confirm and CAS undo.
-- These functions are security-definer solely to write protected ledger tables;
-- every read/write is explicitly scoped by auth.uid(). They are NOT deployed.
begin;

create function public.stage_calendar_draft(
  p_changes jsonb, p_availability jsonb, p_base_revision bigint
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid:=auth.uid();
  zone text;
  current_revision bigint;
  item jsonb;
  w jsonb;
  start_at timestamptz;
  end_at timestamptz;
  draft_id uuid;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_base_revision is null or p_base_revision<0
    or jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes) not between 1 and 50
    or jsonb_typeof(p_availability)<>'array' or jsonb_array_length(p_availability) not between 1 and 100 then
    raise exception 'Invalid draft envelope' using errcode='22023';
  end if;
  select z.name into zone from public.profiles p
    join pg_catalog.pg_timezone_names z on z.name=p.timezone
    where p.user_id=owner_id for share of p;
  if zone is null then raise exception 'Valid IANA timezone required' using errcode='22023'; end if;
  insert into public.calendar_plan_state(user_id) values(owner_id) on conflict do nothing;
  select revision into current_revision from public.calendar_plan_state
    where user_id=owner_id for update;
  if current_revision<>p_base_revision then
    raise exception 'Plan revision changed' using errcode='40001';
  end if;
  if (select count(distinct (x.value->>'id')::uuid)
      from jsonb_array_elements(p_changes) x(value))
      <> jsonb_array_length(p_changes) then
    raise exception 'Duplicate task ID' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(p_changes) x(value) loop
    if jsonb_typeof(item)<>'object'
      or not (item ?& array['id','expected_updated_at','start_at','end_at'])
      or (select count(*) from jsonb_object_keys(item))<>4
      or jsonb_typeof(item->'id')<>'string'
      or jsonb_typeof(item->'expected_updated_at')<>'string'
      or jsonb_typeof(item->'start_at')<>'string'
      or jsonb_typeof(item->'end_at')<>'string'
      or item->>'start_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:00Z$'
      or item->>'end_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:00Z$' then
      raise exception 'Invalid UTC placement' using errcode='22023';
    end if;
    perform (item->>'id')::uuid;
    perform (item->>'expected_updated_at')::timestamptz;
    start_at:=(item->>'start_at')::timestamptz;
    end_at:=(item->>'end_at')::timestamptz;
    if end_at<=start_at or end_at>start_at+interval '1440 minutes' then
      raise exception 'Duration must be 1..1440 elapsed minutes' using errcode='22023';
    end if;
  end loop;
  for w in select value from jsonb_array_elements(p_availability) x(value) loop
    if jsonb_typeof(w)<>'object' or (select count(*) from jsonb_object_keys(w))<>2
      or not (w ?& array['start_at','end_at'])
      or jsonb_typeof(w->'start_at')<>'string'
      or jsonb_typeof(w->'end_at')<>'string'
      or w->>'start_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:00Z$'
      or w->>'end_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:00Z$'
      or (w->>'end_at')::timestamptz <= (w->>'start_at')::timestamptz then
      raise exception 'Invalid availability interval' using errcode='22023';
    end if;
  end loop;
  insert into public.calendar_plan_drafts(user_id,base_revision,timezone,changes,availability)
    values(owner_id,current_revision,zone,p_changes,p_availability) returning id into draft_id;
  return draft_id;
end $$;

create function public.confirm_calendar_draft(p_draft uuid,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid:=auth.uid();
  state_revision bigint;
  draft public.calendar_plan_drafts%rowtype;
  receipt public.calendar_plan_receipts%rowtype;
  zone text;
  item jsonb;
  begins timestamptz;
  finishes timestamptz;
  local_day date;
  local_time time;
  minutes integer;
  batch jsonb:='[]'::jsonb;
  before_rows jsonb;
  after_rows jsonb;
  changed integer;
  next_revision bigint;
begin
  if owner_id is null or p_draft is null or p_request is null then
    raise exception 'Authentication and IDs required' using errcode='42501'; end if;
  -- Serialize receipt and state changes, including ambiguous timeout retries.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,1029));
  insert into public.calendar_plan_state(user_id) values(owner_id) on conflict do nothing;
  select revision into state_revision from public.calendar_plan_state
    where user_id=owner_id for update;
  select * into receipt from public.calendar_plan_receipts
    where user_id=owner_id and request_id=p_request;
  if found then
    if receipt.draft_id<>p_draft then
      raise exception 'Idempotency key belongs to another draft' using errcode='22023';
    end if;
    return jsonb_build_object('receipt_id',receipt.id,'revision',receipt.confirmed_revision,'replay',true);
  end if;
  select * into draft from public.calendar_plan_drafts
    where id=p_draft and user_id=owner_id for update;
  if not found then raise exception 'Draft unavailable' using errcode='42501'; end if;
  if state_revision<>draft.base_revision or draft.expires_at<clock_timestamp()
    or exists(select 1 from public.calendar_plan_receipts r where r.draft_id=p_draft) then
    raise exception 'Draft stale or already confirmed' using errcode='40001';
  end if;
  select z.name into zone from public.profiles p
    join pg_catalog.pg_timezone_names z on z.name=p.timezone
    where p.user_id=owner_id for share of p;
  if zone is distinct from draft.timezone then
    raise exception 'Account timezone changed' using errcode='40001'; end if;
  -- A live focus session has no known end. Fail closed instead of inventing
  -- zero-length fixed blocks. A dedicated ingestion path is still needed for
  -- external-calendar events (not represented by the current database).
  if exists(select 1 from public.focus_sessions f
            where f.user_id=owner_id and f.ended_at is null) then
    raise exception 'Active focus interval has no closed end' using errcode='23P01';
  end if;
  for item in select value from jsonb_array_elements(draft.changes) x(value) loop
    begins:=(item->>'start_at')::timestamptz;
    finishes:=(item->>'end_at')::timestamptz;
    minutes:=extract(epoch from (finishes-begins))::integer/60;
    local_day:=(begins at time zone zone)::date;
    local_time:=(begins at time zone zone)::time;
    -- DST gap/fold contract: only the later fall-back instant is representable
    -- by existing schedules(scheduled_date,scheduled_time).
    if ((local_day+local_time) at time zone zone)<>begins then
      raise exception 'Ambiguous earlier DST fold is not representable' using errcode='22023';
    end if;
    if not exists(
      select 1 from jsonb_array_elements(draft.availability) w(value)
      where (w.value->>'start_at')::timestamptz<=begins
        and (w.value->>'end_at')::timestamptz>=finishes+interval '5 minutes'
    ) then raise exception 'Placement outside availability or mandatory break' using errcode='22023';
    end if;
    if exists(select 1 from public.calendar_task_locks l
      where l.user_id=owner_id and l.schedule_id=(item->>'id')::uuid) then
      raise exception 'Task is manually locked' using errcode='23P01';
    end if;
    batch:=batch||jsonb_build_array(jsonb_build_object(
      'id',item->'id','expected_updated_at',item->'expected_updated_at',
      'scheduled_date',to_char(local_day,'YYYY-MM-DD'),
      'scheduled_time',to_char(local_time,'HH24:MI'),
      'estimated_minutes',minutes));
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'updated_at',s.updated_at,'scheduled_date',s.scheduled_date,
    'scheduled_time',s.scheduled_time,'estimated_minutes',s.estimated_minutes,
    'deferral_count',s.deferral_count)
    order by s.id),'[]'::jsonb) into before_rows
    from public.schedules s
    where s.user_id=owner_id and s.id in
      (select (x.value->>'id')::uuid from jsonb_array_elements(draft.changes) x(value));
  -- This existing RPC locks ALL open owner blocks and rechecks deadlines,
  -- task revisions, ownership, DST and overlaps in the same transaction.
  changed:=public.apply_schedule_batch(batch);
  -- Scheduler's mandatory break is a hard constraint; add a post-write check.
  if exists(
    with selected as(
      select (x.value->>'id')::uuid id from jsonb_array_elements(draft.changes) x(value)
    ), intervals as(
      select s.id,selected.id is not null as chosen,
        ((s.scheduled_date+s.scheduled_time) at time zone zone) as begins,
        ((s.scheduled_date+s.scheduled_time) at time zone zone)
          + s.estimated_minutes*interval '1 minute' as ends
      from public.schedules s left join selected on selected.id=s.id
      where s.user_id=owner_id and not s.is_done and s.deleted_at is null
        and s.scheduled_date is not null and s.scheduled_time is not null
        and s.estimated_minutes is not null
    )
    select 1 from intervals a join intervals b on a.id<b.id
    where (a.chosen or b.chosen)
      and a.begins<b.ends+interval '5 minutes'
      and b.begins<a.ends+interval '5 minutes'
  ) then raise exception 'Required break collides with another block' using errcode='23P01';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'updated_at',s.updated_at,'scheduled_date',s.scheduled_date,
    'scheduled_time',s.scheduled_time,'estimated_minutes',s.estimated_minutes,
    'deferral_count',s.deferral_count)
    order by s.id),'[]'::jsonb) into after_rows
    from public.schedules s
    where s.user_id=owner_id and s.id in
      (select (x.value->>'id')::uuid from jsonb_array_elements(draft.changes) x(value));
  next_revision:=state_revision+1;
  update public.calendar_plan_state set revision=next_revision where user_id=owner_id;
  insert into public.calendar_plan_receipts
    (user_id,draft_id,request_id,confirmed_revision,before_rows,after_rows)
    values(owner_id,p_draft,p_request,next_revision,before_rows,after_rows)
    returning * into receipt;
  return jsonb_build_object('receipt_id',receipt.id,'revision',next_revision,'changed',changed,'replay',false);
end $$;

revoke all on function public.stage_calendar_draft(jsonb,jsonb,bigint) from public,anon,authenticated;
revoke all on function public.confirm_calendar_draft(uuid,uuid) from public,anon,authenticated;
grant execute on function public.stage_calendar_draft(jsonb,jsonb,bigint) to authenticated;
grant execute on function public.confirm_calendar_draft(uuid,uuid) to authenticated;
commit;
