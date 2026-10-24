begin;
select set_config('test.owner',(select id::text from auth.users order by id limit 1),true);
select set_config('test.other',(select id::text from auth.users order by id offset 1 limit 1),true);
-- Dedicated fixtures: two same-name projects, one task with multiple effective intervals.
insert into public.projects(id,user_id,name) values('d1111111-1111-4111-8111-111111111111',current_setting('test.owner')::uuid,'Duplicate name'),('d2222222-2222-4222-8222-222222222222',current_setting('test.owner')::uuid,'Duplicate name');
insert into public.schedules(id,user_id,title,scheduled_date,estimated_minutes,is_done,completed_at) values('d3333333-3333-4333-8333-333333333333',current_setting('test.owner')::uuid,'60 planned 90 actual','2026-11-01',60,true,'2026-11-01T07:00:00Z');
insert into public.focus_sessions(id,user_id,project_id,schedule_id,started_at,ended_at,duration_sec) values
 ('d4444444-4444-4444-8444-444444444444',current_setting('test.owner')::uuid,'d1111111-1111-4111-8111-111111111111','d3333333-3333-4333-8333-333333333333','2026-10-31T23:30:00Z','2026-11-01T06:30:00Z',5400),
 ('d5555555-5555-4555-8555-555555555555',current_setting('test.owner')::uuid,'d2222222-2222-4222-8222-222222222222',null,'2026-11-01T07:00:00Z','2026-11-01T07:01:00Z',60);
insert into public.focus_segments(session_id,user_id,started_at,ended_at,duration_ms) values
 ('d4444444-4444-4444-8444-444444444444',current_setting('test.owner')::uuid,'2026-10-31T23:30:00Z','2026-11-01T00:00:00Z',1800000),
 ('d4444444-4444-4444-8444-444444444444',current_setting('test.owner')::uuid,'2026-11-01T05:30:00Z','2026-11-01T06:30:00Z',3600000),
 ('d5555555-5555-4555-8555-555555555555',current_setting('test.owner')::uuid,'2026-11-01T07:00:00Z','2026-11-01T07:01:00Z',60000);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
do $$ declare report jsonb; t jsonb; total numeric; f public.focus_sessions; begin
 if public.local_day_start('2026-11-01','America/Havana')<>'2026-11-01T04:00:00Z'::timestamptz then raise exception 'Repeated midnight lost first hour'; end if;
 if public.local_day_start('2026-03-08','America/Havana')<>'2026-03-08T05:00:00Z'::timestamptz then raise exception 'Skipped midnight incorrect'; end if;
 if public.local_day_start('2026-03-29','Asia/Beirut')<>'2026-03-28T22:00:00Z'::timestamptz then raise exception 'Beirut midnight gap incorrect'; end if;
 report:=public.analytics_report('2026-10-31','2026-11-01');
 if (select sum(seconds) from public.focus_daily('2026-10-31','2026-11-01'))<>5460 then raise exception 'Intervals lost or double counted: %',report; end if;
 if (select sum(seconds) from public.focus_daily('2026-10-31','2026-10-31'))<>1800 then raise exception 'Cross-day/month attribution broken'; end if;
 if (select sum(seconds) from public.focus_daily('2026-11-01','2026-11-01'))<>3660 then raise exception 'DST repeated hour broken'; end if;
 if jsonb_array_length(report->'projects')<>2 then raise exception 'Same-name projects merged'; end if;
 select value into t from jsonb_array_elements(report->'tasks') where value->>'id'='d3333333-3333-4333-8333-333333333333';
 if (t->>'actual_seconds')::integer/60-(t->>'estimated_minutes')::integer<>30 then raise exception 'Expected +30m variance: %',t; end if;
 if abs((report->>'estimate_fit_percent')::numeric-66.6666666667)>.001 then raise exception 'Estimate fit incorrect'; end if;
 insert into public.schedules(user_id,title,is_done) values(auth.uid(),'Legacy completion date unknown',true) returning id into f.id;
 perform public.mutate_schedule(f.id,(select updated_at from public.schedules where id=f.id),'{"notes":"metadata only"}');
 if (select completed_at from public.schedules where id=f.id) is not null then raise exception 'Invented legacy completion date'; end if;
 -- Actual trigger recording and pause exclusion, not only fixture aggregate inputs.
 insert into public.focus_sessions(user_id,started_at) values(auth.uid(),clock_timestamp()-interval '60 seconds') returning * into f;
 if (select count(*) from public.focus_segments where session_id=f.id and ended_at is null)<>1 then raise exception 'Start segment missing'; end if;
 f:=public.transition_focus(f.id,0,'pause');
 if (select sum(duration_ms) from public.focus_segments where session_id=f.id)<>f.accumulated_ms then raise exception 'Pause interval incorrect'; end if;
 f:=public.transition_focus(f.id,f.focus_revision,'resume');f:=public.transition_focus(f.id,f.focus_revision,'complete');
 if (select count(*) from public.focus_segments where session_id=f.id and ended_at is null)<>0 then raise exception 'Completed segment still open'; end if;
 begin insert into public.focus_segments(session_id,user_id,started_at) values(f.id,auth.uid(),now()); raise exception 'User forged an interval'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$ begin
 if exists(select 1 from public.focus_segments where session_id='d4444444-4444-4444-8444-444444444444') then raise exception 'Foreign interval visible'; end if;
 if exists(select 1 from public.focus_daily('2026-10-31','2026-11-01')) then raise exception 'Foreign analytics visible'; end if;
end $$;
reset role;
set local role anon;
do $$ begin if has_function_privilege('anon','public.analytics_report(date,date,integer)','execute') then raise exception 'AI analytics scope broadened'; end if; end $$;
reset role;
rollback;
