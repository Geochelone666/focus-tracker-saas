begin;
insert into auth.users(id,email) values ('a5000000-0000-4000-8000-000000000001','lock-a@test.invalid'),('a5000000-0000-4000-8000-000000000002','lock-b@test.invalid');
insert into schedules(id,user_id,title,estimated_minutes) values('a5000000-0000-4000-8000-000000000003','a5000000-0000-4000-8000-000000000001','Lock test',30);
set local role authenticated;
select set_config('request.jwt.claim.sub','a5000000-0000-4000-8000-000000000001',true);
do $$ declare stamp timestamptz; first_lock timestamptz; second_lock timestamptz; result jsonb; begin
 select updated_at into stamp from schedules where id='a5000000-0000-4000-8000-000000000003';
 result:=public.set_calendar_task_lock('a5000000-0000-4000-8000-000000000003',stamp,null,true);
 first_lock:=(result->>'lock_version')::timestamptz;
 if not (result->>'locked')::boolean or first_lock is null then raise exception 'Lock missing'; end if;
 if (public.calendar_preview_snapshot()->'lock_versions'->>'a5000000-0000-4000-8000-000000000003')::timestamptz<>first_lock then raise exception 'Snapshot lock version missing'; end if;
 begin
  perform public.set_calendar_task_lock('a5000000-0000-4000-8000-000000000003',stamp,null,false);
  raise exception 'Stale lock state accepted';
 exception when serialization_failure then null; end;
 perform public.set_calendar_task_lock('a5000000-0000-4000-8000-000000000003',stamp,first_lock,false);
 result:=public.set_calendar_task_lock('a5000000-0000-4000-8000-000000000003',stamp,null,true);
 second_lock:=(result->>'lock_version')::timestamptz;
 begin
  perform public.set_calendar_task_lock('a5000000-0000-4000-8000-000000000003',stamp,first_lock,false);
  raise exception 'Older device unlocked a replacement lock';
 exception when serialization_failure then null; end;
 update schedules set title='Changed' where id='a5000000-0000-4000-8000-000000000003';
 begin
  perform public.set_calendar_task_lock('a5000000-0000-4000-8000-000000000003',stamp,second_lock,false);
  raise exception 'Stale task revision accepted';
 exception when serialization_failure then null; end;
 perform set_config('request.jwt.claim.sub','a5000000-0000-4000-8000-000000000002',true);
 begin
  perform public.set_calendar_task_lock('a5000000-0000-4000-8000-000000000003',stamp,second_lock,false);
  raise exception 'Foreign owner changed lock';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.set_calendar_task_lock(uuid,timestamptz,timestamptz,boolean)','execute') then raise exception 'Anonymous lock access'; end if;
end $$;
rollback;
