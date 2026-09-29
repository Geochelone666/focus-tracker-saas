alter table public.focus_sessions enable row level security;

create policy "focus_sessions_select_own"
  on public.focus_sessions
  for select
  using (auth.uid() = user_id);

create policy "focus_sessions_insert_own"
  on public.focus_sessions
  for insert
  with check (auth.uid() = user_id);

create policy "focus_sessions_update_own"
  on public.focus_sessions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "focus_sessions_delete_own"
  on public.focus_sessions
  for delete
  using (auth.uid() = user_id);

alter table public.skills enable row level security;

create policy "skills_select_own"
  on public.skills
  for select
  using (auth.uid() = user_id);

create policy "skills_insert_own"
  on public.skills
  for insert
  with check (auth.uid() = user_id);

create policy "skills_update_own"
  on public.skills
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "skills_delete_own"
  on public.skills
  for delete
  using (auth.uid() = user_id);
