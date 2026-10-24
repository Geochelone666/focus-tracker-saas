begin;
select set_config('test.owner',(select id::text from auth.users order by id limit 1),true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
do $$ declare f public.focus_sessions; b public.focus_sessions; n public.focus_sessions; begin
 insert into public.focus_sessions(user_id,started_at,focus_mode,target_seconds,cycle_count)
 values(auth.uid(),clock_timestamp()-interval '25 minutes','countdown',1500,2) returning * into f;
 f:=public.transition_focus(f.id,0,'complete','work');
 b:=public.next_focus_phase(f.id);
 if b.session_kind<>'short_break' or b.target_seconds<>300 then raise exception 'Five-minute short break missing'; end if;
 n:=public.next_focus_phase(f.id);
 if n.id<>b.id then raise exception 'Duplicate break created'; end if;
 begin insert into public.focus_sessions(user_id) values(auth.uid()); raise exception 'Concurrent focus during break accepted'; exception when unique_violation then null; end;
 b:=public.transition_focus(b.id,0,'pause');
 if b.duration_sec is not null or b.break_duration_sec<>0 then raise exception 'Active break credited'; end if;
 b:=public.transition_focus(b.id,b.focus_revision,'complete');
 if b.duration_sec<>0 or b.break_duration_sec<>floor(b.accumulated_ms/1000.0) then raise exception 'Break mixed with focus'; end if;
 n:=public.next_focus_phase(b.id);
 if n.session_kind<>'focus' or n.cycle_number<>2 or n.target_seconds<>1500 then raise exception 'Next focus lost settings'; end if;
 n:=public.transition_focus(n.id,0,'abandon');
 begin perform public.next_focus_phase(n.id); raise exception 'Abandoned cycle continued'; exception when raise_exception then if sqlerrm='Abandoned cycle continued' then raise; end if; end;
 insert into public.focus_sessions(user_id,started_at,focus_mode,target_seconds,long_break_every,long_break_seconds)
 values(auth.uid(),clock_timestamp()-interval '25 minutes','countdown',1500,1,600) returning * into f;
 f:=public.transition_focus(f.id,0,'complete'); b:=public.next_focus_phase(f.id);
 if b.session_kind<>'long_break' or b.target_seconds<>600 then raise exception 'Configured long break lost'; end if;
 b:=public.transition_focus(b.id,0,'complete');
 begin perform public.next_focus_phase(b.id); raise exception 'Unbounded cycle accepted'; exception when raise_exception then if sqlerrm='Unbounded cycle accepted' then raise; end if; end;
end $$;
reset role;
set local role anon;
do $$ begin if has_function_privilege('anon','public.next_focus_phase(uuid)','execute') then raise exception 'AI break access expanded'; end if; end $$;
reset role;
rollback;
