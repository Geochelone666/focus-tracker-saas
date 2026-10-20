begin;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  target_date date,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.projects enable row level security;
drop policy if exists projects_own on public.projects;
create policy projects_own on public.projects for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.projects to authenticated;

create table if not exists public.daily_reflections (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  note text not null check (char_length(note) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_reflections enable row level security;
drop policy if exists reflections_own on public.daily_reflections;
create policy reflections_own on public.daily_reflections for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.daily_reflections to authenticated;

alter table public.schedules alter column scheduled_date drop not null;
alter table public.schedules add column if not exists priority text not null default 'normal' check (priority in ('low','normal','high'));
alter table public.schedules add column if not exists estimated_minutes integer check (estimated_minutes between 1 and 1440);
alter table public.schedules add column if not exists energy text check (energy in ('low','medium','high'));
alter table public.schedules add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.schedules add column if not exists skill_id uuid references public.skills(id) on delete set null;
alter table public.schedules add column if not exists series_id uuid;
alter table public.schedules add column if not exists deleted_at timestamptz;
alter table public.schedules add column if not exists completed_at timestamptz;
alter table public.schedules add column if not exists deferral_reason text check (deferral_reason is null or char_length(deferral_reason) <= 200);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'schedules_time_requires_date' and conrelid = 'public.schedules'::regclass) then
    alter table public.schedules add constraint schedules_time_requires_date
      check (scheduled_time is null or (scheduled_date is not null and scheduled_time < time '24:00'));
  end if;
end $$;
create index if not exists schedules_series_idx on public.schedules(user_id, series_id, scheduled_date);

-- Do not permit linking another user's project or skill, including through direct API requests.
alter policy schedules_insert_own on public.schedules with check (
  auth.uid() = user_id
  and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  and (skill_id is null or exists (select 1 from public.skills s where s.id = skill_id and s.user_id = auth.uid()))
);
alter policy schedules_update_own on public.schedules with check (
  auth.uid() = user_id
  and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  and (skill_id is null or exists (select 1 from public.skills s where s.id = skill_id and s.user_id = auth.uid()))
);

alter table public.focus_sessions add column if not exists schedule_id uuid references public.schedules(id) on delete set null;
create index if not exists sessions_schedule_idx on public.focus_sessions(user_id, schedule_id);
alter policy focus_sessions_insert_own on public.focus_sessions with check (
  auth.uid() = user_id
  and (skill_id is null or exists (select 1 from public.skills s where s.id = skill_id and s.user_id = auth.uid()))
  and (schedule_id is null or exists (select 1 from public.schedules s where s.id = schedule_id and s.user_id = auth.uid()))
);
alter policy focus_sessions_update_own on public.focus_sessions with check (
  auth.uid() = user_id
  and (skill_id is null or exists (select 1 from public.skills s where s.id = skill_id and s.user_id = auth.uid()))
  and (schedule_id is null or exists (select 1 from public.schedules s where s.id = schedule_id and s.user_id = auth.uid()))
);

-- Edit one occurrence or atomically shift this and future unfinished occurrences.
-- SECURITY INVOKER deliberately retains the caller's RLS policies.
create or replace function public.edit_schedule(
  p_id uuid, p_title text, p_date date, p_time time, p_notes text,
  p_priority text, p_estimate integer, p_energy text, p_project uuid, p_skill uuid,
  p_future boolean default false
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  original public.schedules%rowtype;
  changed integer;
begin
  select * into original from public.schedules
    where id = p_id and user_id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'Schedule not found'; end if;
  if p_future and (original.scheduled_date is null or p_date is null) then
    raise exception 'A series needs a date';
  end if;
  update public.schedules set
    title = p_title,
    scheduled_date = case when id = p_id then p_date else scheduled_date + (p_date - original.scheduled_date) end,
    scheduled_time = p_time, notes = p_notes, priority = p_priority,
    estimated_minutes = p_estimate, energy = p_energy, project_id = p_project, skill_id = p_skill
  where user_id = auth.uid() and deleted_at is null and (
    id = p_id or (p_future and original.series_id is not null and series_id = original.series_id
      and scheduled_date >= original.scheduled_date and not is_done)
  );
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.edit_schedule(uuid,text,date,time,text,text,integer,text,uuid,uuid,boolean) from public;
grant execute on function public.edit_schedule(uuid,text,date,time,text,text,integer,text,uuid,uuid,boolean) to authenticated;

commit;
