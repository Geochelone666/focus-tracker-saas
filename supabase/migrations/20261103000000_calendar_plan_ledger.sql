-- F2-B03: minimal persistent preview/confirm/CAS-undo ledger.
-- This migration is review-only; never run against production without approval.
begin;
create table public.calendar_plan_state(
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check(revision>=0)
);
create table public.calendar_plan_drafts(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  base_revision bigint not null check(base_revision>=0),
  timezone text not null,
  changes jsonb not null check(jsonb_typeof(changes)='array'),
  availability jsonb not null check(jsonb_typeof(availability)='array'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp()+interval '60 minutes'),
  unique(id,user_id)
);
create index calendar_drafts_owner_created on public.calendar_plan_drafts(user_id,created_at desc);
create table public.calendar_plan_receipts(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_id uuid not null,
  request_id uuid not null,
  confirmed_revision bigint not null,
  before_rows jsonb not null,
  after_rows jsonb not null,
  status text not null default 'confirmed' check(status in ('confirmed','undone')),
  undo_request_id uuid,
  undone_revision bigint,
  created_at timestamptz not null default clock_timestamp(),
  undone_at timestamptz,
  unique(user_id,request_id),
  unique(user_id,undo_request_id),
  foreign key(draft_id,user_id) references public.calendar_plan_drafts(id,user_id)
);
create index calendar_receipts_owner_revision on public.calendar_plan_receipts(user_id,confirmed_revision desc);
-- A lock is an explicit user intent, not an algorithm-owned placement.
-- It can be unlocked by the owner, but a confirmation cannot move it.
create table public.calendar_task_locks(
  schedule_id uuid primary key references public.schedules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index calendar_task_locks_owner on public.calendar_task_locks(user_id);
alter table public.calendar_plan_state enable row level security;
alter table public.calendar_plan_drafts enable row level security;
alter table public.calendar_plan_receipts enable row level security;
alter table public.calendar_task_locks enable row level security;
create policy plan_state_read on public.calendar_plan_state for select to authenticated using((select auth.uid())=user_id);
create policy plan_drafts_read on public.calendar_plan_drafts for select to authenticated using((select auth.uid())=user_id);
create policy plan_receipts_read on public.calendar_plan_receipts for select to authenticated using((select auth.uid())=user_id);
create policy plan_locks_read on public.calendar_task_locks for select to authenticated using((select auth.uid())=user_id);
create policy plan_locks_insert on public.calendar_task_locks for insert to authenticated
  with check((select auth.uid())=user_id and exists(
    select 1 from public.schedules s where s.id=schedule_id and s.user_id=(select auth.uid())));
create policy plan_locks_delete on public.calendar_task_locks for delete to authenticated using((select auth.uid())=user_id);
-- Earlier migrations grant default ALL to authenticated. Explicit revocation is essential.
revoke all on public.calendar_plan_state,public.calendar_plan_drafts,public.calendar_plan_receipts,public.calendar_task_locks
  from public,anon,authenticated;
grant select on public.calendar_plan_state,public.calendar_plan_drafts,public.calendar_plan_receipts,public.calendar_task_locks to authenticated;
grant insert,delete on public.calendar_task_locks to authenticated;
commit;
