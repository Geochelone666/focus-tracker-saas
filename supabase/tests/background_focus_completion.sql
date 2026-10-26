-- Focus countdowns must complete even if the browser/app is closed.
-- All generated sessions, intervals and transitions are rolled back.
begin;
select set_config('test.owner',(select id::text from auth.users order by id limit 1),true);
select set_config('test.other',(select id::text from auth.users order by id offset 1 limit 1),true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
do $qa$
declare f public.focus_sessions; begin
  insert into public.focus_sessions(user_id,started_at,focus_mode,target_seconds)
  values(auth.uid(),clock_timestamp()-interval '125 seconds','countdown',60) returning * into f;
  perform set_config('test.due',f.id::text,true);
end $qa$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $qa$
declare f public.focus_sessions; begin
  insert into public.focus_sessions(user_id,started_at,focus_mode,target_seconds)
  values(auth.uid(),clock_timestamp()-interval '10 minutes','countdown',3600) returning * into f;
  f:=public.transition_focus(f.id,f.focus_revision,'pause');
  perform set_config('test.paused',f.id::text,true);
end $qa$;
reset role;
do $qa$
declare updated_count integer; finished public.focus_sessions; paused public.focus_sessions; ledger bigint; begin
  updated_count:=focus_internal.complete_expired_countdowns();
  if updated_count<>1 then raise exception 'Expected exactly one overdue countdown, got %',updated_count; end if;
  select * into finished from public.focus_sessions where id=current_setting('test.due')::uuid;
  select * into paused from public.focus_sessions where id=current_setting('test.paused')::uuid;
  if finished.focus_status<>'completed' or finished.ended_at is null or finished.duration_sec<>60 then
    raise exception 'Expired countdown did not persist exactly 60 seconds';
  end if;
  if finished.accumulated_ms<>60000 then raise exception 'Countdown was not capped'; end if;
  select sum(duration_ms) into ledger from public.focus_segments where session_id=finished.id;
  if ledger<>60000 or exists(select 1 from public.focus_segments where session_id=finished.id and ended_at is null)
    then raise exception 'Interval ledger failed to settle expired countdown';
  end if;
  if paused.focus_status<>'paused' or paused.ended_at is not null then raise exception 'Paused countdown was auto-completed'; end if;
  if focus_internal.complete_expired_countdowns()<>0 then raise exception 'Already completed countdown was processed twice'; end if;
  begin
    perform focus_internal.complete_expired_countdowns(0);
    raise exception 'Invalid batch limit was accepted';
  exception when raise_exception then
    if sqlerrm='Invalid batch limit was accepted' then raise; end if;
  end;
end $qa$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
do $qa$ begin
  if has_schema_privilege('authenticated','focus_internal','usage') then raise exception 'Internal scheduler schema exposed'; end if;
  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='focus_internal' and p.proname='complete_expired_countdowns' and has_function_privilege('authenticated',p.oid,'execute')) then raise exception 'Internal scheduler function exposed'; end if;
end $qa$;
reset role;
set local role anon;
do $qa$ begin
  if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='focus_internal' and p.proname='complete_expired_countdowns' and has_function_privilege('anon',p.oid,'execute')) then raise exception 'Anonymous users can finalize sessions'; end if;
end $qa$;
reset role;
rollback;
