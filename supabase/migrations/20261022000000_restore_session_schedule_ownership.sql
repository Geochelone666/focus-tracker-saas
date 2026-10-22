-- 20260930002658_enforce_session_skill_ownership.sql sorts after 009_planning_workflow.sql,
-- so on a database migrated in file order (as the Supabase CLI does) it replaced the
-- focus_sessions write policies and dropped 009's schedule ownership check. An API client
-- could then attach its sessions to another user's schedule. Restore both checks together.
alter policy "focus_sessions_insert_own" on public.focus_sessions
  with check (
    auth.uid() = user_id
    and (skill_id is null or exists (
      select 1 from public.skills s where s.id = focus_sessions.skill_id and s.user_id = auth.uid()))
    and (schedule_id is null or exists (
      select 1 from public.schedules s where s.id = focus_sessions.schedule_id and s.user_id = auth.uid()))
  );

alter policy "focus_sessions_update_own" on public.focus_sessions
  with check (
    auth.uid() = user_id
    and (skill_id is null or exists (
      select 1 from public.skills s where s.id = focus_sessions.skill_id and s.user_id = auth.uid()))
    and (schedule_id is null or exists (
      select 1 from public.schedules s where s.id = focus_sessions.schedule_id and s.user_id = auth.uid()))
  );
