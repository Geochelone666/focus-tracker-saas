-- Run in a test database with two auth users. All data is rolled back.
begin;
select set_config('test.owner',(select id::text from auth.users order by id limit 1),true);
select set_config('test.other',(select id::text from auth.users order by id offset 1 limit 1),true);
-- Retain any existing test-account active session without changing it.
-- This suite requires dedicated accounts without active sessions.
do $$ begin
 if current_setting('test.other') = '' or current_setting('test.other') is null then raise exception 'Two test accounts required'; end if;
 if exists(select 1 from public.focus_sessions where user_id=current_setting('test.owner')::uuid and ended_at is null) then raise exception 'Test owner already has an active session'; end if;
end $$;
with skill as (insert into public.skills(user_id,name) values(current_setting('test.owner')::uuid,'Focus owner skill') returning id) select set_config('test.skill',(select id::text from skill),true);
with skill as (insert into public.skills(user_id,name) values(current_setting('test.other')::uuid,'Focus foreign skill') returning id) select set_config('test.foreign_skill',(select id::text from skill),true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
do $$ declare s public.focus_sessions; p public.focus_sessions; r public.focus_sessions; begin
 insert into public.focus_sessions(user_id,started_at) values(auth.uid(),clock_timestamp()-interval '60 seconds') returning * into s;
 if s.resumed_at <> s.started_at or s.focus_status <> 'running' then raise exception 'Start not recoverable'; end if;
 -- Two devices cannot start parallel sessions, including while paused.
 begin insert into public.focus_sessions(user_id) values(auth.uid()); raise exception 'Parallel start accepted'; exception when unique_violation then null; end;
 p := public.transition_focus(s.id,0,'pause');
 if p.focus_status <> 'paused' or p.resumed_at is not null or p.accumulated_ms not between 60000 and 65000 or p.duration_sec is not null then raise exception 'Pause accounting broken'; end if;
 begin insert into public.focus_sessions(user_id) values(auth.uid()); raise exception 'Paused session lost uniqueness'; exception when unique_violation then null; end;
 r := public.transition_focus(s.id,0,'pause');
 if r.focus_revision <> p.focus_revision then raise exception 'Retry mutated paused time'; end if;
 begin perform public.transition_focus(s.id,0,'resume'); raise exception 'Stale resume accepted'; exception when serialization_failure then null; end;
 r := public.transition_focus(s.id,p.focus_revision,'resume');
 if r.accumulated_ms <> p.accumulated_ms or r.started_at <> s.started_at then raise exception 'Resume changed history or counted pause'; end if;
 -- A stale pause from before this resume must not pause the new interval.
 begin perform public.transition_focus(s.id,p.focus_revision,'pause'); raise exception 'Stale pause accepted'; exception when serialization_failure then null; end;
 r := public.transition_focus(s.id,r.focus_revision,'complete','first outcome');
 if r.duration_sec not between 60 and 65 then raise exception 'Completion duration broken'; end if;
 p := public.transition_focus(s.id,0,'complete','second outcome');
 if p.duration_sec <> r.duration_sec or p.note <> 'first outcome' or p.focus_revision <> r.focus_revision then raise exception 'Double finish overwrote result'; end if;
 begin update public.focus_sessions set started_at=clock_timestamp() where id=s.id; raise exception 'Original timestamp mutable'; exception when raise_exception then if sqlerrm='Original timestamp mutable' then raise; end if; end;
 insert into public.focus_sessions(user_id,started_at,focus_mode,target_seconds)
 values(auth.uid(),clock_timestamp()-interval '26 minutes','countdown',1500) returning * into s;
 r := public.transition_focus(s.id,0,'complete','25-minute focus');
 if r.duration_sec <> 1500 or r.accumulated_ms <> 1500000 then raise exception 'Countdown overcounted background time'; end if;
 p := public.transition_focus(s.id,0,'complete','duplicate');
 if p.note <> '25-minute focus' or p.duration_sec <> 1500 then raise exception 'Countdown saved twice'; end if;
 insert into public.focus_sessions(user_id,started_at) values(auth.uid(),clock_timestamp()-interval '60 seconds') returning * into s;
 r := public.transition_focus(s.id,0,'abandon');
 if r.duration_sec <> 0 or r.focus_status <> 'abandoned' or r.ended_at is null then raise exception 'Abandon lost history or credited time'; end if;
 insert into public.focus_sessions(user_id) values(auth.uid()) returning * into s;
 begin perform public.transition_focus(s.id,0,'complete',null,current_setting('test.foreign_skill')::uuid); raise exception 'Foreign completion skill accepted'; exception when insufficient_privilege then null; end;
 r := public.transition_focus(s.id,0,'complete',null,current_setting('test.skill')::uuid);
 if r.skill_id <> current_setting('test.skill')::uuid then raise exception 'Owned completion skill lost'; end if;
end $$;
reset role;
-- Cross-owner RPC access must fail under the actual owner RLS.
insert into public.focus_sessions(user_id) values(current_setting('test.other')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
do $$ begin
 if exists(select 1 from public.focus_sessions where user_id=current_setting('test.other')::uuid) then raise exception 'Foreign session visible'; end if;
end $$;
reset role;
select set_config('test.foreign',(select id::text from public.focus_sessions where user_id=current_setting('test.other')::uuid and ended_at is null),true);
set local role authenticated;
do $$ begin
 begin perform public.transition_focus(current_setting('test.foreign')::uuid,0,'complete'); raise exception 'Foreign transition accepted';
 exception when raise_exception then if sqlerrm='Foreign transition accepted' then raise; end if; end;
end $$;
reset role;
set local role anon;
do $$ begin
 if has_function_privilege('anon','public.transition_focus(uuid,integer,text,text,uuid)','EXECUTE') then raise exception 'AI/anonymous lifecycle permission expanded'; end if;
end $$;
reset role;
rollback;
