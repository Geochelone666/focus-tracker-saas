-- Disposable fixtures; all data changes are rolled back. Run after migration 009.
begin;
-- Requires two existing auth users; no auth.users rows are inserted here.
do $$ begin
  if (select count(*) from auth.users) < 2 then raise exception 'This check needs two existing test accounts'; end if;
end $$;
select set_config('test.owner', (select id::text from auth.users order by id limit 1), true);
select set_config('test.other', (select id::text from auth.users order by id offset 1 limit 1), true);
insert into public.projects(id,user_id,name) values
 ('a1111111-1111-4111-8111-111111111111',current_setting('test.owner')::uuid,'QA project'),
 ('a2222222-2222-4222-8222-222222222222',current_setting('test.other')::uuid,'Other project');
insert into public.skills(id,user_id,name) values
 ('b2222222-2222-4222-8222-222222222222',current_setting('test.other')::uuid,'Other skill');
insert into public.schedules(id,user_id,title,scheduled_date,series_id,is_done) values
 ('c1111111-1111-4111-8111-111111111111',current_setting('test.owner')::uuid,'First','2026-10-20','d1111111-1111-4111-8111-111111111111',false),
 ('c2222222-2222-4222-8222-222222222222',current_setting('test.owner')::uuid,'Second','2026-10-21','d1111111-1111-4111-8111-111111111111',false),
 ('c3333333-3333-4333-8333-333333333333',current_setting('test.owner')::uuid,'Completed','2026-10-22','d1111111-1111-4111-8111-111111111111',true),
 ('c4444444-4444-4444-8444-444444444444',current_setting('test.other')::uuid,'Other plan','2026-10-20',null,false);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
do $$ declare n integer; begin
  if exists(select 1 from public.schedules where id='c4444444-4444-4444-8444-444444444444') then raise exception 'Other owner visible'; end if;
  begin
    insert into public.schedules(user_id,title,project_id) values(auth.uid(),'Bad project','a2222222-2222-4222-8222-222222222222');
    raise exception 'Foreign project accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.schedules(user_id,title,skill_id) values(auth.uid(),'Bad skill','b2222222-2222-4222-8222-222222222222');
    raise exception 'Foreign skill accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.focus_sessions(user_id,schedule_id) values(auth.uid(),'c4444444-4444-4444-8444-444444444444');
    raise exception 'Foreign schedule accepted';
  exception when insufficient_privilege then null; end;
  n := public.edit_schedule('c1111111-1111-4111-8111-111111111111','Rescheduled','2026-10-23',null,null,'high',30,'low','a1111111-1111-4111-8111-111111111111',null,true);
  if n <> 2 then raise exception 'Wrong series update count'; end if;
  if (select scheduled_date from public.schedules where id='c2222222-2222-4222-8222-222222222222') <> date '2026-10-24' then raise exception 'Future date not shifted'; end if;
  if (select title from public.schedules where id='c3333333-3333-4333-8333-333333333333') <> 'Completed' then raise exception 'Completed occurrence changed'; end if;
  begin
    perform public.edit_schedule('c4444444-4444-4444-8444-444444444444','Stolen','2026-10-23',null,null,'high',30,null,null,null,false);
    raise exception 'Foreign edit accepted';
  exception when raise_exception then
    if sqlerrm <> 'Schedule not found' then raise; end if;
  end;
  begin
    perform public.edit_schedule('c1111111-1111-4111-8111-111111111111','Forbidden','2026-11-01',null,null,'normal',30,null,'a2222222-2222-4222-8222-222222222222',null,true);
    raise exception 'Foreign project edit accepted';
  exception when insufficient_privilege then null; end;
  if (select title from public.schedules where id='c1111111-1111-4111-8111-111111111111') <> 'Rescheduled' then raise exception 'Failed series edit partially applied'; end if;
  insert into public.schedules(user_id,title,scheduled_date) values(auth.uid(),'Inbox task',null);
  update public.schedules set deleted_at=now() where id='c1111111-1111-4111-8111-111111111111';
  update public.schedules set deleted_at=null where id='c1111111-1111-4111-8111-111111111111';
  if (select deleted_at from public.schedules where id='c1111111-1111-4111-8111-111111111111') is not null then raise exception 'Restore failed'; end if;
  insert into public.daily_reflections(user_id,day,note) values(auth.uid(),'2026-10-20','QA reflection');
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$ begin
  if exists(select 1 from public.daily_reflections where note='QA reflection') then raise exception 'Foreign reflection visible'; end if;
  if exists(select 1 from public.projects where id='a1111111-1111-4111-8111-111111111111') then raise exception 'Foreign project visible'; end if;
end $$;
reset role;
rollback;
