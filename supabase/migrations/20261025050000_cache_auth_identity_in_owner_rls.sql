-- Retain every ownership condition and role while caching auth.uid() once per statement.
-- This changes query-planning overhead, not authorization semantics.
-- Generated from pg_policies expressions verified against the production baseline.
begin;
alter policy "reflections_own" on public."daily_reflections" using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
alter policy "segments_owner" on public."focus_segments" using ((user_id = (select auth.uid())));
alter policy "focus_sessions_delete_own" on public."focus_sessions" using (((select auth.uid()) = user_id));
alter policy "focus_sessions_insert_own" on public."focus_sessions" with check ((((select auth.uid()) = user_id) AND ((skill_id IS NULL) OR (EXISTS ( SELECT 1
   FROM skills
  WHERE ((skills.id = focus_sessions.skill_id) AND (skills.user_id = (select auth.uid())))))) AND ((schedule_id IS NULL) OR (EXISTS ( SELECT 1
   FROM schedules
  WHERE ((schedules.id = focus_sessions.schedule_id) AND (schedules.user_id = (select auth.uid())))))) AND ((project_id IS NULL) OR (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = focus_sessions.project_id) AND (projects.user_id = (select auth.uid()))))))));
alter policy "focus_sessions_select_own" on public."focus_sessions" using (((select auth.uid()) = user_id));
alter policy "focus_sessions_update_own" on public."focus_sessions" using (((select auth.uid()) = user_id)) with check ((((select auth.uid()) = user_id) AND ((skill_id IS NULL) OR (EXISTS ( SELECT 1
   FROM skills
  WHERE ((skills.id = focus_sessions.skill_id) AND (skills.user_id = (select auth.uid())))))) AND ((schedule_id IS NULL) OR (EXISTS ( SELECT 1
   FROM schedules
  WHERE ((schedules.id = focus_sessions.schedule_id) AND (schedules.user_id = (select auth.uid())))))) AND ((project_id IS NULL) OR (EXISTS ( SELECT 1
   FROM projects
  WHERE ((projects.id = focus_sessions.project_id) AND (projects.user_id = (select auth.uid()))))))));
alter policy "activity_own" on public."integration_activity" using ((user_id = (select auth.uid())));
alter policy "tokens_own" on public."integration_tokens" using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "profiles_insert_own" on public."profiles" with check (((select auth.uid()) = user_id));
alter policy "profiles_select_own" on public."profiles" using (((select auth.uid()) = user_id));
alter policy "profiles_update_own" on public."profiles" using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
alter policy "projects_own" on public."projects" using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
alter policy "schedules_insert_own" on public."schedules" with check ((((select auth.uid()) = user_id) AND ((project_id IS NULL) OR (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = schedules.project_id) AND (p.user_id = (select auth.uid())))))) AND ((skill_id IS NULL) OR (EXISTS ( SELECT 1
   FROM skills s
  WHERE ((s.id = schedules.skill_id) AND (s.user_id = (select auth.uid()))))))));
alter policy "schedules_select_own" on public."schedules" using (((select auth.uid()) = user_id));
alter policy "schedules_update_own" on public."schedules" using (((select auth.uid()) = user_id)) with check ((((select auth.uid()) = user_id) AND ((project_id IS NULL) OR (EXISTS ( SELECT 1
   FROM projects p
  WHERE ((p.id = schedules.project_id) AND (p.user_id = (select auth.uid())))))) AND ((skill_id IS NULL) OR (EXISTS ( SELECT 1
   FROM skills s
  WHERE ((s.id = schedules.skill_id) AND (s.user_id = (select auth.uid()))))))));
alter policy "skills_delete_own" on public."skills" using (((select auth.uid()) = user_id));
alter policy "skills_insert_own" on public."skills" with check (((select auth.uid()) = user_id));
alter policy "skills_select_own" on public."skills" using (((select auth.uid()) = user_id));
alter policy "skills_update_own" on public."skills" using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
commit;
