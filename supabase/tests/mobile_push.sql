-- Execute in a test project after the mobile push migration; requires two auth users.
-- Fixtures, device registrations and delivery rows are all rolled back.
begin;
select set_config('test.owner',(select id::text from auth.users order by id limit 1),true);
select set_config('test.other',(select id::text from auth.users order by id offset 1 limit 1),true);
insert into public.profiles(user_id,timezone) values(current_setting('test.owner')::uuid,'America/New_York') on conflict(user_id) do update set timezone=excluded.timezone;
insert into public.push_devices(id,user_id,expo_token,platform,lead_minutes,last_seen_at) values
 ('e1111111-1111-4111-8111-111111111111',current_setting('test.owner')::uuid,'ExpoPushToken[qa-owner]','ios',10,'2026-10-23T16:00:00Z');
insert into public.schedules(id,user_id,title,scheduled_date,scheduled_time,is_done,deleted_at) values
 ('f1111111-1111-4111-8111-111111111111',current_setting('test.owner')::uuid,'Due','2026-10-23','12:10',false,null),
 ('f2222222-2222-4222-8222-222222222222',current_setting('test.other')::uuid,'Foreign due','2026-10-23','12:10',false,null),
 ('f3333333-3333-4333-8333-333333333333',current_setting('test.owner')::uuid,'Done','2026-10-23','12:10',true,null),
 ('f4444444-4444-4444-8444-444444444444',current_setting('test.owner')::uuid,'Trashed','2026-10-23','12:10',false,now()),
 ('f5555555-5555-4555-8555-555555555555',current_setting('test.owner')::uuid,'All day','2026-10-23',null,false,null);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$ begin
 if exists(select 1 from public.push_devices) then raise exception 'Foreign phone visible'; end if;
 begin perform * from public.claim_push_reminders();raise exception 'User could dispatch';exception when insufficient_privilege then null;end;
 begin perform * from public.push_deliveries;raise exception 'User could read delivery internals';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform * from public.push_devices;raise exception 'Anon could read phones';exception when insufficient_privilege then null;end;
 begin perform * from public.claim_push_reminders();raise exception 'Anon could dispatch';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
do $$ declare jobs integer; j record; begin
 select * into j from public.claim_push_reminders('2026-10-23T16:00:00Z',100);
 if j.schedule_id is distinct from 'f1111111-1111-4111-8111-111111111111'::uuid then raise exception 'Wrong scheduled plan';end if;
 if j.scheduled_at<>timestamptz '2026-10-23T16:10:00Z' then raise exception 'Timezone conversion wrong';end if;
 if not public.check_push_delivery(j.delivery_id,j.lease_id,'2026-10-23T16:00:00Z') then raise exception 'Valid job rejected';end if;
 select count(*) into jobs from public.claim_push_reminders('2026-10-23T16:00:30Z',100);
 if jobs<>0 then raise exception 'Duplicate claim';end if;
 update public.schedules set is_done=true where id=j.schedule_id;
 if public.check_push_delivery(j.delivery_id,j.lease_id,'2026-10-23T16:00:30Z') then raise exception 'Completed plan still sent';end if;
 update public.schedules set is_done=false,scheduled_time='13:00' where id=j.schedule_id;
 if public.check_push_delivery(j.delivery_id,j.lease_id,'2026-10-23T16:00:30Z') then raise exception 'Rescheduled plan still sent';end if;
 update public.schedules set scheduled_time='12:10' where id=j.schedule_id;
 update public.push_devices set enabled=false;
 if public.check_push_delivery(j.delivery_id,j.lease_id,'2026-10-23T16:00:30Z') then raise exception 'Disabled phone still sent';end if;
 update public.push_devices set enabled=true;
 perform * from public.claim_push_reminders('2026-10-23T16:02:01Z',100);
 if public.check_push_delivery(j.delivery_id,j.lease_id,'2026-10-23T16:02:01Z') then raise exception 'Old lease still valid';end if;
 perform * from public.claim_push_reminders('2026-10-23T16:04:02Z',100);
 if (select attempts from public.push_deliveries where id=j.delivery_id)<>3 then raise exception 'Retry attempts wrong';end if;
 select count(*) into jobs from public.claim_push_reminders('2026-10-23T16:04:59Z',100);
 if jobs<>0 then raise exception 'Too many attempts';end if;
 -- Rescheduling creates a new reminder key; title/notes changes do not.
 update public.schedules set scheduled_time='12:20' where id=j.schedule_id;
 select count(*) into jobs from public.claim_push_reminders('2026-10-23T16:10:00Z',100);
 if jobs<>1 then raise exception 'New time did not produce new reminder';end if;
end $$;
reset role;
-- DST: nonexistent wall times are excluded; ambiguous times use standard time once.
update public.schedules set scheduled_date='2026-03-08',scheduled_time='02:05' where id='f1111111-1111-4111-8111-111111111111';
update public.push_devices set last_seen_at='2026-03-08T07:00:00Z';
set local role service_role;
do $$ begin if exists(select 1 from public.claim_push_reminders('2026-03-08T07:00:00Z',100)) then raise exception 'Nonexistent DST time sent';end if;end $$;
reset role;
update public.schedules set scheduled_date='2026-11-01',scheduled_time='01:30' where id='f1111111-1111-4111-8111-111111111111';
update public.push_devices set last_seen_at='2026-11-01T05:20:00Z';
set local role service_role;
do $$ declare n integer;begin
 select count(*) into n from public.claim_push_reminders('2026-11-01T05:20:00Z',100);if n<>0 then raise exception 'First ambiguous occurrence sent';end if;
 select count(*) into n from public.claim_push_reminders('2026-11-01T06:20:00Z',100);if n<>1 then raise exception 'Standard-time occurrence missing';end if;
end $$;
reset role;
-- Database-level device ownership is enforced even for direct Supabase requests.
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$ begin
 begin insert into public.push_devices(id,user_id,expo_token,platform) values(gen_random_uuid(),current_setting('test.owner')::uuid,'ExpoPushToken[forged]','android');raise exception 'Foreign device owner accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into public.push_devices(id,user_id,transport,web_subscription,platform,last_seen_at)
 values('e2222222-2222-4222-8222-222222222222',current_setting('test.owner')::uuid,'web','{"endpoint":"https://web.push.apple.com/test","keys":{"p256dh":"test","auth":"test"}}','web','2026-11-01T06:20:00Z');
set local role service_role;
do $$ declare j record;begin
 select * into j from public.claim_push_reminders('2026-11-01T06:20:00Z',100);
 if j.web_subscription->>'endpoint' is distinct from 'https://web.push.apple.com/test' then raise exception 'Web push job missing';end if;
 if j.expo_token is not null then raise exception 'Web push required an Expo token';end if;
end $$;
-- Regression: a temporarily delayed scheduler still catches up before the plan begins.
-- This is 8 minutes after the configured 10-minute advance reminder, beyond the old 5-minute grace window.
do $$ declare j record; n integer; begin
 update public.push_devices set enabled=false where transport='web';
 update public.push_devices set enabled=true,last_seen_at='2026-10-25T16:08:00Z' where transport='expo';
 update public.schedules set scheduled_date='2026-10-25',scheduled_time='12:10',is_done=false,deleted_at=null
  where id='f1111111-1111-4111-8111-111111111111';
 select * into j from public.claim_push_reminders('2026-10-25T16:08:00Z',100);
 if j.schedule_id is distinct from 'f1111111-1111-4111-8111-111111111111'::uuid then raise exception 'Catch-up missed pending reminder'; end if;
 if not public.check_push_delivery(j.delivery_id,j.lease_id,'2026-10-25T16:08:00Z') then raise exception 'Catch-up was rejected before send'; end if;
 select count(*) into n from public.claim_push_reminders('2026-10-25T16:08:30Z',100);
 if n<>0 then raise exception 'Catch-up claimed reminder twice'; end if;
 if public.check_push_delivery(j.delivery_id,j.lease_id,'2026-10-25T16:11:01Z') then raise exception 'Stale catch-up was sent'; end if;
end $$;
rollback;
