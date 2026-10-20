create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  scheduled_date date not null check (scheduled_date between date '0002-01-01' and date '9998-12-31'),
  scheduled_time time,
  notes text check (notes is null or char_length(notes) <= 2000),
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists schedules_user_date_idx on public.schedules(user_id, scheduled_date);
alter table public.schedules enable row level security;
create policy schedules_select_own on public.schedules for select to authenticated using (auth.uid() = user_id);
create policy schedules_insert_own on public.schedules for insert to authenticated with check (auth.uid() = user_id);
create policy schedules_update_own on public.schedules for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.schedules to authenticated;
