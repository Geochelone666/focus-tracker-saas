begin;
insert into auth.users(id,email) values
 ('a4000000-0000-4000-8000-000000000001','snapshot-a@test.invalid'),
 ('a4000000-0000-4000-8000-000000000002','snapshot-b@test.invalid');
insert into public.schedules(user_id,title,estimated_minutes) values
 ('a4000000-0000-4000-8000-000000000001','Snapshot owner A',30),
 ('a4000000-0000-4000-8000-000000000002','Snapshot owner B',30);
do $$ begin
 if has_function_privilege('anon','public.calendar_preview_snapshot()','execute') then
   raise exception 'Anonymous snapshot access'; end if;
 if has_function_privilege('anon','public.stage_calendar_preview(jsonb,jsonb,bigint,text)','execute') then
   raise exception 'Anonymous staging access'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a4000000-0000-4000-8000-000000000001',true);
do $$ declare snapshot jsonb; begin
 snapshot:=public.calendar_preview_snapshot();
 if snapshot->>'user_id'<>'a4000000-0000-4000-8000-000000000001'
   or jsonb_array_length(snapshot->'schedules')<>1
   or snapshot->'schedules'->0->>'title'<>'Snapshot owner A'
   or jsonb_typeof(snapshot->'revision')<>'string'
   or snapshot->>'revision'<>'0' then
   raise exception 'Invalid owner snapshot'; end if;
end $$;
select set_config('request.jwt.claim.sub','a4000000-0000-4000-8000-000000000002',true);
do $$ declare snapshot jsonb; begin
 snapshot:=public.calendar_preview_snapshot();
 if jsonb_array_length(snapshot->'schedules')<>1
   or snapshot->'schedules'->0->>'title'<>'Snapshot owner B' then
   raise exception 'Snapshot leaked another owner'; end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 if public.calendar_preview_snapshot() is not null then raise exception 'Missing identity returned data'; end if;
end $$;
rollback;
