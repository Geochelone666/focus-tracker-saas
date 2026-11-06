-- Read-only export: fixed collection/column allowlist, owner RLS, bounded keyset pages.
begin;
create index schedules_export_owner_id on public.schedules(user_id,id);
create index focus_sessions_export_owner_id on public.focus_sessions(user_id,id);
create index focus_segments_export_owner_id on public.focus_segments(user_id,id);
create index calendar_plan_drafts_export_owner_id on public.calendar_plan_drafts(user_id,id);
create index calendar_plan_receipts_export_owner_id on public.calendar_plan_receipts(user_id,id);
create index integration_activity_export_owner_id on public.integration_activity(user_id,id);
create index projects_export_owner_id on public.projects(user_id,id);
create index skills_export_owner_id on public.skills(user_id,id);
create function public.account_export_page(p_collection text,p_after text default null,p_limit integer default 100)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare relation_name text; key_name text; key_type text; columns_sql text; result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 100 or char_length(p_after)>64 then
  raise exception 'Invalid export page' using errcode='22023'; end if;
 case p_collection
 when 'profile' then relation_name:='profiles'; key_name:='user_id'; key_type:='uuid'; columns_sql:='user_id,daily_focus_target_minutes,timezone,created_at,updated_at';
 when 'skills' then relation_name:='skills'; key_name:='id'; key_type:='uuid'; columns_sql:='id,user_id,name,is_done,created_at,updated_at';
 when 'projects' then relation_name:='projects'; key_name:='id'; key_type:='uuid'; columns_sql:='id,user_id,name,description,target_date,is_done,created_at';
 when 'tasks' then relation_name:='schedules'; key_name:='id'; key_type:='uuid'; columns_sql:='id,user_id,title,scheduled_date,scheduled_time,notes,is_done,priority,estimated_minutes,energy,project_id,skill_id,series_id,deleted_at,completed_at,deferral_reason,updated_at,deadline,deferral_count,remaining_minutes,resume_note,created_at';
 when 'focus_sessions' then relation_name:='focus_sessions'; key_name:='id'; key_type:='uuid'; columns_sql:='id,user_id,started_at,ended_at,duration_sec,note,created_at,updated_at,skill_id,schedule_id,focus_mode,target_seconds,focus_status,accumulated_ms::text as accumulated_ms,resumed_at,focus_revision,session_kind,break_duration_sec,project_id,cycle_number,cycle_count,short_break_seconds,long_break_seconds,long_break_every,cycle_focus_seconds,previous_session_id';
 when 'focus_segments' then relation_name:='focus_segments'; key_name:='id'; key_type:='bigint'; columns_sql:='id::text as id,session_id,user_id,started_at,ended_at,duration_ms::text as duration_ms';
 when 'daily_reflections' then relation_name:='daily_reflections'; key_name:='day'; key_type:='date'; columns_sql:='user_id,day,note,updated_at';
 when 'calendar_state' then relation_name:='calendar_plan_state'; key_name:='user_id'; key_type:='uuid'; columns_sql:='user_id,revision::text as revision';
 when 'calendar_drafts' then relation_name:='calendar_plan_drafts'; key_name:='id'; key_type:='uuid'; columns_sql:='id,user_id,base_revision::text as base_revision,timezone,changes,availability,created_at,expires_at,work_revision::text as work_revision,schema_version,input_fingerprint,base_version_id';
 when 'calendar_receipts' then relation_name:='calendar_plan_receipts'; key_name:='id'; key_type:='uuid'; columns_sql:='id,user_id,draft_id,request_id,confirmed_revision::text as confirmed_revision,before_rows,after_rows,status,undo_request_id,undone_revision::text as undone_revision,created_at,undone_at';
 when 'calendar_locks' then relation_name:='calendar_task_locks'; key_name:='schedule_id'; key_type:='uuid'; columns_sql:='schedule_id,user_id,created_at';
 when 'work_preferences' then relation_name:='calendar_work_preferences'; key_name:='user_id'; key_type:='uuid'; columns_sql:='user_id,starts,finishes,revision::text as revision';
 when 'ai_connections' then relation_name:='integration_tokens'; key_name:='id'; key_type:='uuid'; columns_sql:='id,user_id,name,scope,created_at,expires_at,revoked_at,last_used_at';
 when 'ai_activity' then relation_name:='integration_activity'; key_name:='id'; key_type:='uuid'; columns_sql:='id,user_id,token_id,operation,schedule_id,created_at';
 when 'notification_devices' then relation_name:='push_devices'; key_name:='id'; key_type:='uuid'; columns_sql:='id,user_id,platform,transport,name,lead_minutes,enabled,last_test_at,last_seen_at,created_at';
 else raise exception 'Unknown export collection' using errcode='22023';
 end case;
 -- All SQL identifiers, types and projections above are constants. Caller input
 -- is passed as parameters; no caller-provided user ID or relation is accepted.
 execute format(
  'with page as materialized (
    select %s,%I as _sort,%I::text as _cursor from public.%I
    where user_id=$1 and ($2 is null or %I > $2::%s) order by %I limit $3
   ) select jsonb_build_object(
    ''rows'',coalesce(jsonb_agg(to_jsonb(page)-''_sort''-''_cursor'' order by _sort),''[]''::jsonb),
    ''next_cursor'',case when count(*)=$3 then (select _cursor from page order by _sort desc limit 1) else null end,
    ''captured_at'',statement_timestamp()) from page',
  columns_sql,key_name,key_name,relation_name,key_name,key_type,key_name)
 into result using auth.uid(),p_after,p_limit;
 return result;
end $$;
revoke all on function public.account_export_page(text,text,integer) from public,anon,authenticated;
grant execute on function public.account_export_page(text,text,integer) to authenticated;
commit;
