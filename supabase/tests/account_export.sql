begin;
insert into auth.users(id,email) values
 ('c6000000-0000-4000-8000-000000000001','export-a@test.invalid'),
 ('c6000000-0000-4000-8000-000000000002','export-b@test.invalid');
insert into schedules(id,user_id,title,estimated_minutes) values
 ('c6000000-0000-4000-8000-000000000003','c6000000-0000-4000-8000-000000000001','First',60),
 ('c6000000-0000-4000-8000-000000000004','c6000000-0000-4000-8000-000000000001','Second',30),
 ('c6000000-0000-4000-8000-000000000005','c6000000-0000-4000-8000-000000000002','Foreign private title',90);
update schedules set deleted_at=now(),resume_note='Pick up here',remaining_minutes=15 where id='c6000000-0000-4000-8000-000000000004';
insert into integration_tokens(user_id,name,token_hash,scope,expires_at) values
 ('c6000000-0000-4000-8000-000000000001','Test connection',repeat('a',64),'read',now()+interval '1 day');
insert into push_devices(id,user_id,platform,transport,name,web_subscription) values
 ('c6000000-0000-4000-8000-000000000006','c6000000-0000-4000-8000-000000000001','web','web','Test phone','{"endpoint":"https://private.invalid/push","keys":{"auth":"private-key"}}');
insert into focus_sessions(id,user_id,started_at,ended_at,duration_sec) values
 ('c6000000-0000-4000-8000-000000000007','c6000000-0000-4000-8000-000000000001','2026-11-01T05:59:00.123456Z','2026-11-01T06:00:00.123456Z',60);
insert into focus_segments(id,session_id,user_id,started_at,ended_at,duration_ms) overriding system value values
 (9007199254740993,'c6000000-0000-4000-8000-000000000007','c6000000-0000-4000-8000-000000000001','2026-11-01T05:59:00.123456Z','2026-11-01T06:00:00.123456Z',60000);
-- A future sensitive column must not silently enter the export.
alter table schedules add column export_future_secret text default 'future-private-value';
set local role authenticated;
select set_config('request.jwt.claim.sub','c6000000-0000-4000-8000-000000000001',true);
do $$ declare first_page jsonb; next_page jsonb; name text; result jsonb; begin
 first_page:=public.account_export_page('tasks',null,1);
 if jsonb_array_length(first_page->'rows')<>1 or first_page->>'next_cursor'<>'c6000000-0000-4000-8000-000000000003' then raise exception 'First keyset page incorrect'; end if;
 -- Moving a previously read row to Trash preserves the stable cursor.
 update schedules set deleted_at=now() where id='c6000000-0000-4000-8000-000000000003';
 next_page:=public.account_export_page('tasks',first_page->>'next_cursor',1);
 if next_page->'rows'->0->>'title'<>'Second' or next_page->'rows'->0->>'resume_note'<>'Pick up here' then raise exception 'Cursor or Trash/recovery export missing'; end if;
 if jsonb_array_length(public.account_export_page('tasks',next_page->>'next_cursor',1)->'rows')<>0 then raise exception 'Foreign row leaked after final page'; end if;
 result:=public.account_export_page('focus_segments');
 if result->'rows'->0->>'id'<>'9007199254740993' or jsonb_typeof(result->'rows'->0->'id')<>'string' or (result->'rows'->0->>'started_at')::timestamptz<>'2026-11-01T05:59:00.123456Z'::timestamptz then raise exception 'Export lost bigint or instant precision'; end if;
 result:=public.account_export_page('ai_connections');
 if result::text like '%token_hash%' or result::text like '%'||repeat('a',64)||'%' or result->'rows'->0->>'name'<>'Test connection' then raise exception 'Connection export leaked credentials'; end if;
 result:=public.account_export_page('notification_devices');
 if result::text like '%endpoint%' or result::text like '%private-key%' or result::text like '%web_subscription%' or result::text like '%expo_token%' then raise exception 'Push export leaked credentials'; end if;
 foreach name in array array['profile','skills','projects','tasks','focus_sessions','focus_segments','daily_reflections','calendar_state','calendar_drafts','calendar_receipts','calendar_locks','work_preferences','ai_connections','ai_activity','notification_devices'] loop
  result:=public.account_export_page(name);
  if result::text like '%Foreign private title%' or result::text like '%future-private-value%' then raise exception 'Export projection or ownership failed'; end if;
 end loop;
 begin perform public.account_export_page('integration_tokens'); raise exception 'Unlisted relation exported'; exception when invalid_parameter_value then null; end;
 begin perform public.account_export_page('tasks',null,101); raise exception 'Unbounded page accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.account_export_page('tasks','''; select * from auth.users; --'); raise exception 'Invalid cursor accepted'; exception when invalid_text_representation then null; end;
 perform set_config('request.jwt.claim.sub','c6000000-0000-4000-8000-000000000002',true);
 if jsonb_array_length(public.account_export_page('tasks')->'rows')<>1 or jsonb_array_length(public.account_export_page('ai_connections')->'rows')<>0 then raise exception 'Other owner isolation failed'; end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.account_export_page(text,text,integer)','execute') then raise exception 'Anonymous export granted'; end if;
end $$;
rollback;
