-- Disposable fixtures only. The application uses GoTrue admin deletion.
begin;
insert into auth.users(id,email) values
 ('ba000000-0000-4000-8000-000000000001','delete-fixture@test.invalid'),
 ('ba000000-0000-4000-8000-000000000002','keep-fixture@test.invalid');
insert into public.skills(id,user_id,name) values
 ('ba100000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','Delete skill');
insert into public.projects(id,user_id,name) values
 ('ba200000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','Delete project');
insert into public.schedules(id,user_id,title,skill_id,project_id) values
 ('ba300000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','Delete task','ba100000-0000-4000-8000-000000000001','ba200000-0000-4000-8000-000000000001'),
 ('ba300000-0000-4000-8000-000000000002','ba000000-0000-4000-8000-000000000002','Keep task',null,null);
insert into public.focus_sessions(id,user_id,schedule_id,skill_id,project_id,started_at,ended_at,duration_sec) values
 ('ba400000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','ba300000-0000-4000-8000-000000000001','ba100000-0000-4000-8000-000000000001','ba200000-0000-4000-8000-000000000001','2026-11-01T05:00:00Z','2026-11-01T06:00:00Z',3600);
insert into public.focus_segments(session_id,user_id,started_at,ended_at,duration_ms) values
 ('ba400000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','2026-11-01T05:00:00Z','2026-11-01T06:00:00Z',3600000);
insert into public.daily_reflections(user_id,day,note) values
 ('ba000000-0000-4000-8000-000000000001','2026-11-01','Delete reflection');
insert into public.integration_tokens(id,user_id,name,token_hash,scope,expires_at) values
 ('ba500000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','Delete key',repeat('b',64),'read',now()+interval '1 day');
insert into public.integration_activity(token_id,user_id,operation,schedule_id) values
 ('ba500000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','create_schedule','ba300000-0000-4000-8000-000000000001');
insert into public.push_devices(id,user_id,expo_token,platform,name) values
 ('ba600000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','ExpoPushToken[DeleteFixture]','android','Delete phone');
insert into public.push_deliveries(device_id,schedule_id,scheduled_at) values
 ('ba600000-0000-4000-8000-000000000001','ba300000-0000-4000-8000-000000000001',now());
insert into public.calendar_plan_state(user_id) values ('ba000000-0000-4000-8000-000000000001');
insert into public.calendar_plan_drafts(id,user_id,base_revision,timezone,changes,availability) values
 ('ba700000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001',0,'America/Toronto','[]','[]');
insert into public.calendar_plan_receipts(user_id,draft_id,request_id,confirmed_revision,before_rows,after_rows) values
 ('ba000000-0000-4000-8000-000000000001','ba700000-0000-4000-8000-000000000001',gen_random_uuid(),1,'[]','[]');
insert into public.calendar_task_locks(schedule_id,user_id) values
 ('ba300000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001');
insert into public.calendar_work_preferences(user_id,starts,finishes,revision) values
 ('ba000000-0000-4000-8000-000000000001','09:00','17:00',1);

do $$ begin
 if has_table_privilege('authenticated','auth.users','DELETE') then
   raise exception 'Client can directly delete authentication users';
 end if;
end $$;
delete from auth.users where id='ba000000-0000-4000-8000-000000000001';
do $$ declare item record; remaining bigint; begin
 for item in select table_name from information_schema.columns
   where table_schema='public' and column_name='user_id'
 loop
   execute format('select count(*) from public.%I where user_id=$1',item.table_name)
     into remaining using 'ba000000-0000-4000-8000-000000000001'::uuid;
   if remaining<>0 then raise exception 'Orphaned owner records in %',item.table_name; end if;
 end loop;
 if exists(select 1 from public.push_deliveries where device_id='ba600000-0000-4000-8000-000000000001') then
   raise exception 'Orphaned push work';
 end if;
 if (select count(*) from auth.users where id='ba000000-0000-4000-8000-000000000002')<>1
   or (select title from public.schedules where id='ba300000-0000-4000-8000-000000000002')<>'Keep task'
 then raise exception 'Other account changed'; end if;
end $$;
rollback;
