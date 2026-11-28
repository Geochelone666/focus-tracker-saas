begin;
insert into auth.users(id,email) values
 ('b6000000-0000-4000-8000-000000000001','work-a@test.invalid'),
 ('b6000000-0000-4000-8000-000000000002','work-b@test.invalid');
insert into public.schedules(id,user_id,title,estimated_minutes) values
 ('b6000000-0000-4000-8000-000000000003','b6000000-0000-4000-8000-000000000001','Work hours task',60);
set local role authenticated;
select set_config('request.jwt.claim.sub','b6000000-0000-4000-8000-000000000001',true);
do $$ declare prefs jsonb; windows jsonb; changes jsonb; contract jsonb; draft uuid; receipt jsonb; result jsonb; stamp timestamptz; begin
 prefs:=public.save_calendar_work_preferences('09:00','17:00',0,'America/Toronto');
 if prefs->>'revision'<>'1' or public.calendar_preview_snapshot()->'work_preferences' is distinct from prefs then raise exception 'Saved hours not in snapshot'; end if;
 begin
  perform public.save_calendar_work_preferences('10:00','18:00',0,'America/Toronto');
  raise exception 'Stale preference save accepted';
 exception when serialization_failure then null; end;
 begin
  update public.calendar_work_preferences set revision=999;
  raise exception 'Direct preference mutation granted';
 exception when insufficient_privilege then null; end;
 select updated_at into stamp from public.schedules where id='b6000000-0000-4000-8000-000000000003';
 windows:='[{"start_at":"2027-06-15T13:00:00Z","end_at":"2027-06-15T21:00:00Z"}]';
 changes:=jsonb_build_array(jsonb_build_object('id','b6000000-0000-4000-8000-000000000003','expected_updated_at',stamp,'start_at','2027-06-15T14:00:00Z','end_at','2027-06-15T15:00:00Z'));
 contract:=jsonb_build_object('schema_version','smart-calendar/v0.1','input_fingerprint','sha256:'||repeat('a',64),'base_version_id',null,'work_revision','1');
 begin
  perform public.stage_calendar_preview(changes,windows,0,'America/Toronto',jsonb_set(contract,'{work_revision}','1'));
  raise exception 'Numeric revision envelope accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.save_calendar_work_preferences('09:00','24:00',1,'America/Toronto');
  raise exception 'Unrepresentable work end accepted';
 exception when invalid_parameter_value then null; end;
 draft:=public.stage_calendar_preview(changes,windows,0,'America/Toronto',contract);
 if (select input_fingerprint from public.calendar_plan_drafts where id=draft) is distinct from contract->>'input_fingerprint' then raise exception 'Contract provenance missing'; end if;
 -- ABA: identical saved times with a newer revision must invalidate the old draft.
 perform public.save_calendar_work_preferences('10:00','18:00',1,'America/Toronto');
 perform public.save_calendar_work_preferences('09:00','17:00',2,'America/Toronto');
 begin
  perform public.confirm_calendar_draft(draft,'b6000000-0000-4000-8000-000000000004');
  raise exception 'Old work revision accepted';
 exception when serialization_failure then null; end;
 if exists(select 1 from public.calendar_plan_receipts where draft_id=draft)
  or (select scheduled_date is not null or updated_at<>stamp from public.schedules where id='b6000000-0000-4000-8000-000000000003')
  or (select revision from public.calendar_plan_state where user_id=auth.uid())<>0 then raise exception 'Failed confirm not atomic'; end if;
 contract:=jsonb_set(contract,'{work_revision}','"3"');
 begin
  perform public.stage_calendar_preview(changes,'[{"start_at":"2027-06-15T12:00:00Z","end_at":"2027-06-15T21:00:00Z"}]',0,'America/Toronto',contract);
  raise exception 'Browser expanded authoritative hours';
 exception when serialization_failure then null; end;
 draft:=public.stage_calendar_preview(changes,windows,0,'America/Toronto',contract);
 receipt:=public.confirm_calendar_draft(draft,'b6000000-0000-4000-8000-000000000005');
 perform public.save_calendar_work_preferences('10:00','18:00',3,'America/Toronto');
 result:=public.confirm_calendar_draft(draft,'b6000000-0000-4000-8000-000000000005');
 if result->>'receipt_id' is distinct from receipt->>'receipt_id' or result->>'replay'<>'true' then raise exception 'Preference change broke receipt replay'; end if;
 perform public.undo_calendar_plan((receipt->>'receipt_id')::uuid,'b6000000-0000-4000-8000-000000000006');
 -- Existing staging APIs cannot bypass saved hours at confirmation.
 select updated_at into stamp from public.schedules where id='b6000000-0000-4000-8000-000000000003';
 changes:=jsonb_set(changes,'{0,expected_updated_at}',to_jsonb(stamp));
 draft:=public.stage_calendar_preview(changes,windows,2,'America/Toronto');
 begin
  perform public.confirm_calendar_draft(draft,'b6000000-0000-4000-8000-000000000007');
  raise exception 'Legacy draft bypassed hours';
 exception when serialization_failure then
  if sqlerrm<>'Work windows differ from saved hours' then raise; end if;
 end;
 perform set_config('request.jwt.claim.sub','b6000000-0000-4000-8000-000000000002',true);
 if exists(select 1 from public.calendar_work_preferences) or public.calendar_preview_snapshot()->'work_preferences'<>'null'::jsonb then raise exception 'Foreign hours leaked'; end if;
 begin
  perform public.save_calendar_work_preferences('08:00','16:00',4,'America/Toronto');
  raise exception 'Foreign revision accepted';
 exception when serialization_failure then null; end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.save_calendar_work_preferences(time,time,bigint,text)','execute')
 or has_function_privilege('authenticated','public.validate_calendar_work_windows(uuid,jsonb,text,bigint)','execute') then raise exception 'Internal work preference permissions leaked'; end if;
end $$;
rollback;
