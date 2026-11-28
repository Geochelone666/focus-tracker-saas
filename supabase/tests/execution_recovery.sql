begin;
insert into auth.users(id,email) values('a6000000-0000-4000-8000-000000000001','recover-a@test.invalid'),('a6000000-0000-4000-8000-000000000002','recover-b@test.invalid');
insert into schedules(id,user_id,title,scheduled_date,scheduled_time,estimated_minutes) values('a6000000-0000-4000-8000-000000000003','a6000000-0000-4000-8000-000000000001','Recover','2026-11-05','14:00',60);
insert into focus_sessions(user_id,schedule_id,started_at,ended_at,duration_sec) values
 ('a6000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000003',now()-interval '90 minutes',now()-interval '45 minutes',2700),
 ('a6000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000003',now()-interval '45 minutes',now(),2700);
set local role authenticated;
select set_config('request.jwt.claim.sub','a6000000-0000-4000-8000-000000000001',true);
do $$ declare stamp timestamptz; next_stamp timestamptz; result jsonb; begin
 select updated_at into stamp from schedules where id='a6000000-0000-4000-8000-000000000003';
 next_stamp:=public.save_task_recovery('a6000000-0000-4000-8000-000000000003',stamp,30,'Next: run the database checks');
 result:=public.task_recovery_snapshot('2026-11-05','2026-11-05',0);
 if (result->'tasks'->0->>'actual_seconds')::integer<>5400 or (result->'tasks'->0->>'remaining_minutes')::integer<>30
 or (result->'tasks'->0->>'estimated_minutes')::integer<>60 or result->'tasks'->0->>'scheduled_time'<>'14:00:00'
 or (select is_done from schedules where id='a6000000-0000-4000-8000-000000000003') then raise exception 'Recovery changed accounting or schedule'; end if;
 begin
  perform public.save_task_recovery('a6000000-0000-4000-8000-000000000003',stamp,20,'stale');
  raise exception 'Stale context accepted';
 exception when serialization_failure then null; end;
 begin
  perform public.save_task_recovery('a6000000-0000-4000-8000-000000000003',next_stamp,0,'zero');
  raise exception 'Zero remainder accepted as completion';
 exception when invalid_parameter_value then null; end;
 perform public.save_task_recovery('a6000000-0000-4000-8000-000000000003',next_stamp,null,'');
 if (public.task_recovery_snapshot('2026-11-05','2026-11-05',0)->'tasks'->0->>'remaining_minutes') is not null then raise exception 'Unknown estimate not retained'; end if;
 insert into schedules(id,user_id,title) values('a6000000-0000-4000-8000-000000000004',auth.uid(),'Inbox recovery');
 insert into focus_sessions(user_id,schedule_id,started_at,ended_at,duration_sec) values(auth.uid(),'a6000000-0000-4000-8000-000000000004','2026-11-05T16:00:00Z','2026-11-05T16:01:00Z',60);
 if (public.task_recovery_snapshot('2026-11-05','2026-11-05',0)->>'total')::integer<>2 then raise exception 'Recently focused Inbox task missing'; end if;
 -- A later break must not replace the task's latest focus outcome or accounting.
 insert into focus_sessions(user_id,schedule_id,session_kind,started_at,ended_at,duration_sec,note) values
 (auth.uid(),'a6000000-0000-4000-8000-000000000004','short_break','2026-11-05T16:02:00Z','2026-11-05T16:07:00Z',300,'Break outcome');
 select item into result from jsonb_array_elements(public.task_recovery_snapshot('2026-11-05','2026-11-05',0)->'tasks') item
 where item->>'id'='a6000000-0000-4000-8000-000000000004';
 if (result->'latest_session'->>'started_at')::timestamptz is distinct from '2026-11-05T16:00:00Z'::timestamptz
 or (result->>'actual_seconds')::integer is distinct from 60 then raise exception 'Break replaced latest focus outcome'; end if;
 -- A task with only a break has no focus outcome, even when planned in range.
 insert into schedules(id,user_id,title,scheduled_date) values('a6000000-0000-4000-8000-000000000008',auth.uid(),'Break only','2026-11-05');
 insert into focus_sessions(user_id,schedule_id,session_kind,started_at,ended_at,duration_sec,note) values
 (auth.uid(),'a6000000-0000-4000-8000-000000000008','long_break','2026-11-05T17:00:00Z','2026-11-05T17:15:00Z',900,'Rested');
 select item into result from jsonb_array_elements(public.task_recovery_snapshot('2026-11-05','2026-11-05',0)->'tasks') item
 where item->>'id'='a6000000-0000-4000-8000-000000000008';
 if result->'latest_session' is distinct from 'null'::jsonb or result->>'actual_seconds' is not null then raise exception 'Break invented focus outcome'; end if;
 -- A linked active break remains resumable without inventing focus history.
 insert into focus_sessions(id,user_id,schedule_id,session_kind) values
 ('a6000000-0000-4000-8000-000000000009',auth.uid(),'a6000000-0000-4000-8000-000000000008','short_break');
 perform public.transition_focus('a6000000-0000-4000-8000-000000000009',0,'pause');
 select item into result from jsonb_array_elements(public.task_recovery_snapshot('2026-11-05','2026-11-05',0)->'tasks') item
 where item->>'id'='a6000000-0000-4000-8000-000000000008';
 if result->>'active_status' is distinct from 'paused' or result->'latest_session' is distinct from 'null'::jsonb
 then raise exception 'Paused break lost recovery entry or invented focus'; end if;
 perform public.transition_focus('a6000000-0000-4000-8000-000000000009',1,'abandon');
 -- Toronto's repeated-hour day is 25 hours. Include a session crossing its
 -- midnight, exclude one ending exactly at the boundary and the next day.
 update profiles set timezone='America/Toronto' where user_id=auth.uid();
 insert into schedules(id,user_id,title) values
 ('a6000000-0000-4000-8000-000000000005',auth.uid(),'Cross-midnight recovery'),
 ('a6000000-0000-4000-8000-000000000006',auth.uid(),'Previous day only'),
 ('a6000000-0000-4000-8000-000000000007',auth.uid(),'Next day only');
 insert into focus_sessions(user_id,schedule_id,started_at,ended_at,duration_sec) values
 (auth.uid(),'a6000000-0000-4000-8000-000000000005','2026-11-01T03:50:00Z','2026-11-01T04:10:00Z',1200),
 (auth.uid(),'a6000000-0000-4000-8000-000000000006','2026-11-01T03:50:00Z','2026-11-01T04:00:00Z',600),
 (auth.uid(),'a6000000-0000-4000-8000-000000000007','2026-11-02T05:00:00Z','2026-11-02T05:10:00Z',600);
 result:=public.task_recovery_snapshot('2026-11-01','2026-11-01',0);
 if (result->>'total')::integer<>1 or result->'tasks'->0->>'id'<>'a6000000-0000-4000-8000-000000000005' then raise exception 'Recovery timezone overlap boundary failed'; end if;
 perform set_config('request.jwt.claim.sub','a6000000-0000-4000-8000-000000000002',true);
 if (public.task_recovery_snapshot('2026-11-05','2026-11-05',0)->>'total')::integer<>0 then raise exception 'Foreign recovery leaked'; end if;
 begin
  perform public.save_task_recovery('a6000000-0000-4000-8000-000000000003',next_stamp,30,'foreign');
  raise exception 'Foreign recovery write accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.task_recovery_snapshot('2026-01-01','2026-12-31',0);
  raise exception 'Unbounded recovery interval accepted';
 exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.save_task_recovery(uuid,timestamptz,integer,text)','execute') or has_function_privilege('anon','public.task_recovery_snapshot(date,date,integer)','execute') then raise exception 'Anonymous recovery access'; end if;
end $$;
rollback;
