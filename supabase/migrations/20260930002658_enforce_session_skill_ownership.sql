-- API clients must obey the same skill ownership rule as the server actions.
-- Keep the existing per-user policies; tighten only their write checks.
alter policy "focus_sessions_insert_own" on public.focus_sessions
  with check (
    auth.uid() = user_id
    and (
      skill_id is null
      or exists (
        select 1 from public.skills
        where skills.id = focus_sessions.skill_id
          and skills.user_id = auth.uid()
      )
    )
  );

alter policy "focus_sessions_update_own" on public.focus_sessions
  with check (
    auth.uid() = user_id
    and (
      skill_id is null
      or exists (
        select 1 from public.skills
        where skills.id = focus_sessions.skill_id
          and skills.user_id = auth.uid()
      )
    )
  );
