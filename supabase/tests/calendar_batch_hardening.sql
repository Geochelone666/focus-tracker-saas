-- F2-B02 SQL regression; disposable fixture with a final ROLLBACK.
-- Runs in PGlite migration harness and on a dedicated Supabase test database.
begin;
do $$ begin
  if has_function_privilege('anon',
    'public.edit_schedule(uuid,text,date,time,text,text,integer,text,uuid,uuid,boolean)','execute')
    or has_function_privilege('authenticated',
    'public.edit_schedule(uuid,text,date,time,text,text,integer,text,uuid,uuid,boolean)','execute') then
    raise exception 'Unversioned schedule editor remains callable';
  end if;
  if has_function_privilege('anon','public.apply_schedule_batch(jsonb)','execute')
    or not has_function_privilege('authenticated','public.apply_schedule_batch(jsonb)','execute') then
    raise exception 'Unexpected batch API privileges';
  end if;
end $$;
select set_config('test.owner',(select id::text from auth.users order by id limit 1),true);
select set_config('test.other',(select id::text from auth.users order by id offset 1 limit 1),true);
insert into public.schedules(id,user_id,title) values
 ('f2111111-1111-4111-8111-111111111111',current_setting('test.owner')::uuid,'Batch first'),
 ('f2222222-2222-4222-8222-222222222222',current_setting('test.owner')::uuid,'Batch second'),
 ('f2333333-3333-4333-8333-333333333333',current_setting('test.other')::uuid,'Foreign batch task');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
do $$
declare
  a public.schedules%rowtype;
  b public.schedules%rowtype;
  foreign_stamp timestamptz;
  changes jsonb;
  old_a timestamptz;
begin
  select * into a from public.schedules where id='f2111111-1111-4111-8111-111111111111';
  select * into b from public.schedules where id='f2222222-2222-4222-8222-222222222222';
  select updated_at into foreign_stamp from public.schedules
     where id='f2333333-3333-4333-8333-333333333333';
  -- Caller must never see a foreign schedule.
  if foreign_stamp is not null then raise exception 'RLS leaked another owner'; end if;
  changes:=jsonb_build_array(
    jsonb_build_object('id',a.id,'expected_updated_at',a.updated_at,
      'scheduled_date','2027-06-15','scheduled_time','09:00','estimated_minutes',60),
    jsonb_build_object('id',b.id,'expected_updated_at',b.updated_at,
      'scheduled_date','2027-06-15','scheduled_time','10:00','estimated_minutes',60));
  if public.apply_schedule_batch(changes)<>2 then raise exception 'Wrong batch size'; end if;
  select * into a from public.schedules where id=a.id;
  select * into b from public.schedules where id=b.id;
  if a.scheduled_time<>time '09:00' or b.scheduled_time<>time '10:00' then
    raise exception 'Atomic batch did not update both tasks';
  end if;

  -- A duplicate request cannot apply twice; no second reschedule occurs.
  begin
    perform public.apply_schedule_batch(changes);
    raise exception 'Repeated batch unexpectedly committed';
  exception when serialization_failure then null; end;
  if (select scheduled_time from public.schedules where id=a.id)<>time '09:00' then
    raise exception 'Replay changed schedule';
  end if;

  -- Duplicate IDs are rejected before any writes.
  changes:=jsonb_build_array(
    jsonb_build_object('id',a.id,'expected_updated_at',a.updated_at,
      'scheduled_date','2027-06-15','scheduled_time','11:00','estimated_minutes',60),
    jsonb_build_object('id',a.id,'expected_updated_at',a.updated_at,
      'scheduled_date','2027-06-15','scheduled_time','12:00','estimated_minutes',60));
  begin
    perform public.apply_schedule_batch(changes);
    raise exception 'Duplicate task ID accepted';
  exception when invalid_parameter_value then null; end;

  -- One stale entry rejects the entire two-row mutation.
  changes:=jsonb_build_array(
    jsonb_build_object('id',a.id,'expected_updated_at',a.updated_at,
      'scheduled_date','2027-06-15','scheduled_time','12:00','estimated_minutes',60),
    jsonb_build_object('id',b.id,'expected_updated_at','2020-01-01T00:00:00Z',
      'scheduled_date','2027-06-15','scheduled_time','13:00','estimated_minutes',60));
  begin
    perform public.apply_schedule_batch(changes);
    raise exception 'Stale batch partially applied';
  exception when serialization_failure then null; end;
  if (select scheduled_time from public.schedules where id=a.id)<>time '09:00' then
    raise exception 'Valid first item escaped a rolled-back batch';
  end if;

  -- A collision with an unchanged plan must be rejected; back-to-back is OK.
  changes:=jsonb_build_array(
    jsonb_build_object('id',a.id,'expected_updated_at',a.updated_at,
      'scheduled_date','2027-06-15','scheduled_time','10:30','estimated_minutes',45));
  begin
    perform public.apply_schedule_batch(changes);
    raise exception 'Calendar overlap accepted';
  exception when exclusion_violation then null; end;

  -- A foreign task in the request rejects the entire batch.
  changes:=jsonb_build_array(
    jsonb_build_object('id',a.id,'expected_updated_at',a.updated_at,
      'scheduled_date','2027-06-15','scheduled_time','11:00','estimated_minutes',60),
    jsonb_build_object('id','f2333333-3333-4333-8333-333333333333',
      'expected_updated_at',b.updated_at,
      'scheduled_date','2027-06-15','scheduled_time','14:00','estimated_minutes',60));
  begin
    perform public.apply_schedule_batch(changes);
    raise exception 'Foreign-owner batch accepted';
  exception when insufficient_privilege then null; end;
  if (select scheduled_time from public.schedules where id=a.id)<>time '09:00' then
    raise exception 'Cross-owner batch partially applied';
  end if;

  -- Reject nonexistent Toronto spring-forward time.
  changes:=jsonb_build_array(
    jsonb_build_object('id',a.id,'expected_updated_at',a.updated_at,
      'scheduled_date','2027-03-14','scheduled_time','02:30','estimated_minutes',30));
  begin
    perform public.apply_schedule_batch(changes);
    raise exception 'DST gap accepted';
  exception when invalid_parameter_value then null; end;

  -- A successful second write is allowed when every revision is fresh.
  changes:=jsonb_build_array(
    jsonb_build_object('id',a.id,'expected_updated_at',a.updated_at,
      'scheduled_date','2027-06-15','scheduled_time','11:00','estimated_minutes',45));
  if public.apply_schedule_batch(changes)<>1 then raise exception 'Fresh revision rejected'; end if;
  if (select scheduled_time from public.schedules where id=a.id)<>time '11:00' then
    raise exception 'Follow-up batch lost';
  end if;
end $$;
reset role;
rollback;
