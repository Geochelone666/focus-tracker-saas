-- F2-B02: do not leave the unversioned legacy writer callable.
-- Existing web writes use mutate_schedule; the mobile client already supplies
-- updated_at as an optimistic WHERE predicate. Do not revoke table UPDATE.
begin;

revoke execute on function public.edit_schedule(
  uuid,text,date,time,text,text,integer,text,uuid,uuid,boolean
) from public, anon, authenticated;

-- A deliberately narrow, atomic scheduler commit against existing tasks.
-- Draft/version persistence is NOT added until the algorithm/UI contract is agreed.
-- Input: [{id, expected_updated_at, scheduled_date, scheduled_time,
--          estimated_minutes}]. All five fields are required and non-null.
-- In particular: this routine cannot create tasks, change ownership, delete,
-- complete, or mutate any task content. A repeat with stale revisions fails.
create or replace function public.apply_schedule_batch(p_changes jsonb)
returns integer
language plpgsql security invoker set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  zone text;
  item jsonb;
  task public.schedules%rowtype;
  request_id uuid;
  requested_date date;
  requested_time time;
  requested_minutes integer;
  expected timestamptz;
  total integer;
  locked_count integer := 0;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Expected an array of changes' using errcode = '22023';
  end if;
  total := jsonb_array_length(p_changes);
  if total < 1 or total > 50 then
    raise exception 'Choose 1 to 50 task changes' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_changes) as x(value) loop
    if jsonb_typeof(item) <> 'object'
      or (select count(*) from jsonb_object_keys(item)) <> 5
      or exists (
        select 1 from jsonb_object_keys(item) as field(key)
        where field.key not in ('id', 'expected_updated_at', 'scheduled_date',
                                'scheduled_time', 'estimated_minutes')
      )
      or jsonb_typeof(item->'id') <> 'string'
      or jsonb_typeof(item->'expected_updated_at') <> 'string'
      or jsonb_typeof(item->'scheduled_date') <> 'string'
      or jsonb_typeof(item->'scheduled_time') <> 'string'
      or jsonb_typeof(item->'estimated_minutes') <> 'number' then
      raise exception 'Invalid batch change shape' using errcode = '22023';
    end if;
    request_id := (item->>'id')::uuid;
    requested_date := (item->>'scheduled_date')::date;
    requested_time := (item->>'scheduled_time')::time;
    requested_minutes := (item->>'estimated_minutes')::integer;
    expected := (item->>'expected_updated_at')::timestamptz;
    if requested_date not between date '0002-01-01' and date '9998-12-31'
       or requested_time >= time '24:00'
       or requested_minutes not between 1 and 1440 then
      raise exception 'Invalid batch time or duration' using errcode = '22023';
    end if;
  end loop;
  if (select count(distinct (x.value->>'id')::uuid)
        from jsonb_array_elements(p_changes) as x(value)) <> total then
    raise exception 'Duplicate task in batch' using errcode = '22023';
  end if;

  -- Serialize this RPC for one owner, then acquire row locks in UUID order.
  -- Other legacy direct task writes are NOT subject to this advisory lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 1029));
  select z.name into zone
    from public.profiles p join pg_catalog.pg_timezone_names z on z.name = p.timezone
    where p.user_id = owner_id;
  if zone is null then
    raise exception 'Set a valid account timezone before scheduling' using errcode = '22023';
  end if;

  for task in
    select s.* from public.schedules s
    where s.user_id = owner_id
      and s.id in (select (x.value->>'id')::uuid
                   from jsonb_array_elements(p_changes) as x(value))
    order by s.id for update
  loop
    locked_count := locked_count + 1;
  end loop;
  if locked_count <> total then
    raise exception 'Task unavailable' using errcode = '42501';
  end if;

  for item in select value from jsonb_array_elements(p_changes) as x(value) loop
    request_id := (item->>'id')::uuid;
    expected := (item->>'expected_updated_at')::timestamptz;
    select * into task from public.schedules
      where id = request_id and user_id = owner_id;
    if task.is_done or task.deleted_at is not null then
      raise exception 'Cannot reschedule completed or trashed task' using errcode = '22023';
    end if;
    if task.updated_at is distinct from expected then
      raise exception 'Task changed; reload plan' using errcode = '40001';
    end if;
    requested_date := (item->>'scheduled_date')::date;
    requested_time := (item->>'scheduled_time')::time;
    if (((requested_date + requested_time) at time zone zone) at time zone zone)
         <> requested_date + requested_time then
      raise exception 'Nonexistent local time' using errcode = '22023';
    end if;
  end loop;

  -- Evaluate the *whole proposed calendar* before changing a row.
  -- Compare UTC instants, not wall-clock strings; adjacent blocks are allowed.
  -- Ignore unrelated pre-existing overlaps, but reject any overlap involving
  -- at least one changed task. Existing manual edits may still allow overlap.
  if exists (
    with requested as (
      select (x.value->>'id')::uuid as id,
             (x.value->>'scheduled_date')::date as d,
             (x.value->>'scheduled_time')::time as t,
             (x.value->>'estimated_minutes')::integer as minutes
      from jsonb_array_elements(p_changes) as x(value)
    ), current_blocks as (
      select s.id, r.id is not null as selected,
             coalesce(r.d,s.scheduled_date) as d,
             coalesce(r.t,s.scheduled_time) as t,
             coalesce(r.minutes,s.estimated_minutes) as minutes
      from public.schedules s left join requested r on r.id=s.id
      where s.user_id=owner_id and not s.is_done and s.deleted_at is null
    ), intervals as (
      select id,selected,(d+t) at time zone zone as begins,
             ((d+t) at time zone zone) + minutes*interval '1 minute' as ends
      from current_blocks where d is not null and t is not null
        and minutes is not null
        and (((d+t) at time zone zone) at time zone zone) = d+t
    )
    select 1 from intervals a join intervals b on a.id < b.id
    where (a.selected or b.selected)
      and a.begins < b.ends and b.begins < a.ends
  ) then
    raise exception 'Calendar time conflict' using errcode = '23P01';
  end if;

  -- The function is one SQL statement. Any error in this loop rolls it all
  -- back; each row also retains mutate_schedule's optimistic revision check.
  for item in select value from jsonb_array_elements(p_changes) as x(value)
              order by (value->>'id')::uuid loop
    perform public.mutate_schedule(
      (item->>'id')::uuid,
      (item->>'expected_updated_at')::timestamptz,
      jsonb_build_object(
        'scheduled_date',item->'scheduled_date',
        'scheduled_time',item->'scheduled_time',
        'estimated_minutes',item->'estimated_minutes'
      )
    );
  end loop;
  return total;
end
$$;
revoke all on function public.apply_schedule_batch(jsonb) from public, anon;
grant execute on function public.apply_schedule_batch(jsonb) to authenticated;
commit;
