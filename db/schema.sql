create extension if not exists pgcrypto;

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_sec integer,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint focus_sessions_duration_nonnegative check (duration_sec is null or duration_sec >= 0),
  constraint focus_sessions_ended_after_start check (ended_at is null or ended_at >= started_at)
);

create index if not exists idx_focus_sessions_user_started_at
  on public.focus_sessions (user_id, started_at desc);
