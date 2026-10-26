-- A background-finished focus must still allow a user to save a note/skill
-- without rewriting immutable credited duration or another account's rows.
begin;
select set_config('test.owner',(select id::text from auth.users order by id limit 1),true);
select set_config('test.other',(select id::text from auth.users order by id offset 1 limit 1),true);
insert into public.skills(id,user_id,name) values
 ('f1111111-1111-4111-8111-111111111111',current_setting('test.owner')::uuid,'Outcome owned skill'),
 ('f2222222-2222-4222-8222-222222222222',current_setting('test.other')::uuid,'Outcome foreign skill');
insert into public.focus_sessions(user_id,started_at,ended_at,duration_sec)
values(current_setting('test.owner')::uuid,now()-interval '60 seconds',now(),60);
select set_config('test.session',(select id::text from public.focus_sessions where user_id=current_setting('test.owner')::uuid order by created_at desc limit 1),true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
do $qa$
declare
 before_row public.focus_sessions;
 after_row public.focus_sessions;
 modified integer;
begin
 select * into before_row from public.focus_sessions where id=current_setting('test.session')::uuid;
 update public.focus_sessions set note='After automatic finish',skill_id='f1111111-1111-4111-8111-111111111111'
 where id=before_row.id and focus_status='completed' and focus_revision=0
 returning * into after_row;
 if after_row.note<>'After automatic finish' or after_row.focus_revision<>1 or after_row.skill_id<>'f1111111-1111-4111-8111-111111111111'
 then raise exception 'Completed outcome not editable'; end if;
 if after_row.duration_sec<>before_row.duration_sec or after_row.ended_at<>before_row.ended_at
 or after_row.accumulated_ms<>before_row.accumulated_ms then raise exception 'Metadata edit changed credited focus time'; end if;
 update public.focus_sessions set note='Stale version' where id=before_row.id and focus_revision=0;
 get diagnostics modified=row_count;
 if modified<>0 then raise exception 'Stale update overwrote outcome'; end if;
 begin
  update public.focus_sessions set skill_id='f2222222-2222-4222-8222-222222222222' where id=before_row.id;
  raise exception 'Foreign skill assigned to outcome';
 exception when others then
  if sqlerrm='Foreign skill assigned to outcome' then raise; end if;
 end;
end $qa$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $qa$
declare modified integer;begin
 update public.focus_sessions set note='Cross-owner forged outcome' where id=current_setting('test.session')::uuid;
 get diagnostics modified=row_count;
 if modified<>0 then raise exception 'Foreign outcome overwritten';end if;
end $qa$;
reset role;
rollback;
