-- F2-B03 migration regression: PGlite smoke + PostgreSQL CI.
-- Every fixture is transaction-scoped; no production state is changed.
begin;
select set_config('test.owner',(select id::text from auth.users order by id limit 1),true);
select set_config('test.other',(select id::text from auth.users order by id offset 1 limit 1),true);
insert into public.schedules(id,user_id,title,scheduled_date,scheduled_time,estimated_minutes)
values
 ('f3011111-1111-4111-8111-111111111111',current_setting('test.owner')::uuid,'Draft task','2027-06-15','08:00',30),
 ('f3022222-2222-4222-8222-222222222222',current_setting('test.owner')::uuid,'Untouched block','2027-06-15','15:00',30),
 ('f3033333-3333-4333-8333-333333333333',current_setting('test.other')::uuid,'Foreign block','2027-06-15','13:00',30);
do $$
begin
  if has_table_privilege('authenticated','public.calendar_plan_state','update')
     or has_table_privilege('authenticated','public.calendar_plan_receipts','insert')
     or has_table_privilege('authenticated','public.calendar_plan_drafts','insert')
     or has_function_privilege('anon','public.confirm_calendar_draft(uuid,uuid)','execute')
     or has_function_privilege('anon','public.undo_calendar_plan(uuid,uuid)','execute')
  then raise exception 'Protected plan ledger is directly writable or anonymously callable'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
do $$
declare
  stamp timestamptz;
  draft_id uuid;
  receipt_id uuid;
  confirm_result jsonb;
  replay jsonb;
  undone jsonb;
  inverse_replay jsonb;
  initial_date date;
  initial_time time;
  stale_id uuid;
  foreign_id uuid;
begin
  select updated_at,scheduled_date,scheduled_time into stamp,initial_date,initial_time
    from public.schedules where id='f3011111-1111-4111-8111-111111111111';
  draft_id:=public.stage_calendar_draft(
    jsonb_build_array(jsonb_build_object('id','f3011111-1111-4111-8111-111111111111',
       'expected_updated_at',stamp,'start_at','2027-06-15T17:00:00Z','end_at','2027-06-15T17:30:00Z')),
    '[{"start_at":"2027-06-15T16:00:00Z","end_at":"2027-06-15T20:00:00Z"}]',0);
  confirm_result:=public.confirm_calendar_draft(draft_id,'f3111111-1111-4111-8111-111111111111');
  receipt_id:=(confirm_result->>'receipt_id')::uuid;
  if (confirm_result->>'revision')::bigint<>1 or (confirm_result->>'changed')::int<>1
    or (select scheduled_time from public.schedules where id='f3011111-1111-4111-8111-111111111111')<>time '13:00' then
    raise exception 'Confirmation did not atomically apply UTC placement';
  end if;
  replay:=public.confirm_calendar_draft(draft_id,'f3111111-1111-4111-8111-111111111111');
  if replay->>'replay'<>'true' or replay->>'receipt_id'<>receipt_id::text then
    raise exception 'Idempotent confirm replay mismatch';
  end if;
  -- A different request cannot confirm the same single-use draft.
  begin
    perform public.confirm_calendar_draft(draft_id,'f3222222-2222-4222-8222-222222222222');
    raise exception 'Repeated draft unexpectedly applied';
  exception when serialization_failure then null; end;
  undone:=public.undo_calendar_plan(receipt_id,'f3333333-3333-4333-8333-333333333333');
  inverse_replay:=public.undo_calendar_plan(receipt_id,'f3333333-3333-4333-8333-333333333333');
  if (undone->>'revision')::bigint<>2 or inverse_replay->>'replay'<>'true'
    or (select scheduled_date from public.schedules where id='f3011111-1111-4111-8111-111111111111') is distinct from initial_date
    or (select scheduled_time from public.schedules where id='f3011111-1111-4111-8111-111111111111') is distinct from initial_time then
    raise exception 'CAS undo did not restore prior state';
  end if;
  -- A true date postponement increments deferral_count on confirm, while
  -- inverse CAS must restore its prior derived counter.
  select updated_at into stamp from public.schedules
    where id='f3011111-1111-4111-8111-111111111111';
  draft_id:=public.stage_calendar_draft(
    jsonb_build_array(jsonb_build_object('id','f3011111-1111-4111-8111-111111111111',
      'expected_updated_at',stamp,'start_at','2027-06-16T17:00:00Z',
      'end_at','2027-06-16T17:30:00Z')),
    '[{"start_at":"2027-06-16T16:00:00Z","end_at":"2027-06-16T21:00:00Z"}]',2);
  confirm_result:=public.confirm_calendar_draft(draft_id,'f3555555-5555-4555-8555-555555555555');
  receipt_id:=(confirm_result->>'receipt_id')::uuid;
  if (select deferral_count from public.schedules
      where id='f3011111-1111-4111-8111-111111111111')<>1 then
    raise exception 'Confirmation did not record postponement';
  end if;
  perform public.undo_calendar_plan(receipt_id,'f3666666-6666-4666-8666-666666666666');
  if (select deferral_count from public.schedules
      where id='f3011111-1111-4111-8111-111111111111')<>0 then
    raise exception 'Undo failed to restore deferral counter';
  end if;
  -- Existing wall-time storage supports only the later/standard DST fold.
  -- The earlier UTC fold must be rejected rather than silently moved an hour.
  select updated_at into stamp from public.schedules
    where id='f3011111-1111-4111-8111-111111111111';
  draft_id:=public.stage_calendar_draft(
    jsonb_build_array(jsonb_build_object('id','f3011111-1111-4111-8111-111111111111',
      'expected_updated_at',stamp,'start_at','2027-11-07T05:30:00Z',
      'end_at','2027-11-07T06:00:00Z')),
    '[{"start_at":"2027-11-07T04:00:00Z","end_at":"2027-11-07T08:00:00Z"}]',4);
  begin
    perform public.confirm_calendar_draft(draft_id,'f3777777-7777-4777-8777-777777777777');
    raise exception 'Earlier DST fold was silently accepted';
  exception when invalid_parameter_value then null; end;
  if (select revision from public.calendar_plan_state
      where user_id=current_setting('test.owner')::uuid)<>4 then
    raise exception 'Rejected fold modified plan revision';
  end if;
  draft_id:=public.stage_calendar_draft(
    jsonb_build_array(jsonb_build_object('id','f3011111-1111-4111-8111-111111111111',
      'expected_updated_at',stamp,'start_at','2027-11-07T06:30:00Z',
      'end_at','2027-11-07T07:00:00Z')),
    '[{"start_at":"2027-11-07T04:00:00Z","end_at":"2027-11-07T08:00:00Z"}]',4);
  confirm_result:=public.confirm_calendar_draft(draft_id,'f3888888-8888-4888-8888-888888888888');
  receipt_id:=(confirm_result->>'receipt_id')::uuid;
  if (select scheduled_time from public.schedules
      where id='f3011111-1111-4111-8111-111111111111')<>time '01:30' then
    raise exception 'Later DST fold lost local wall time';
  end if;
  perform public.undo_calendar_plan(receipt_id,'f3999999-9999-4999-8999-999999999999');
  -- Stale plan revision cannot stage another confirmed plan against version zero.
  begin
    perform public.stage_calendar_draft(
      jsonb_build_array(jsonb_build_object('id','f3011111-1111-4111-8111-111111111111',
        'expected_updated_at',stamp,'start_at','2027-06-15T17:00:00Z','end_at','2027-06-15T17:30:00Z')),
      '[{"start_at":"2027-06-15T16:00:00Z","end_at":"2027-06-15T20:00:00Z"}]',0);
    raise exception 'Stale revision was accepted';
  exception when serialization_failure then null; end;
  -- Foreign user cannot confirm this user's draft even with a known UUID.
  perform set_config('request.jwt.claim.sub',current_setting('test.other'),true);
  if exists(select 1 from public.calendar_plan_receipts where id=receipt_id) then
    raise exception 'Cross-user receipt leaked through RLS';
  end if;
  begin
    perform public.confirm_calendar_draft(draft_id,'f3444444-4444-4444-8444-444444444444');
    raise exception 'Foreign draft was confirmed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
end $$;
rollback;
