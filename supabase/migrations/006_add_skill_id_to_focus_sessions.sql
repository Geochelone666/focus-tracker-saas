alter table public.focus_sessions add column if not exists skill_id uuid references public.skills (id) on delete set null;
create index if not exists idx_focus_sessions_user_skill on public.focus_sessions (user_id, skill_id);
