-- Enforce one running session per user, including concurrent Start requests.
-- Repair legacy duplicates before indexing without inventing focused time.
begin;
lock table public.focus_sessions in share row exclusive mode;

with ranked as (
  select id, row_number() over (
    partition by user_id order by started_at desc, id desc
  ) as position
  from public.focus_sessions
  where ended_at is null
)
update public.focus_sessions as session
set ended_at = session.started_at, duration_sec = 0
from ranked
where session.id = ranked.id and ranked.position > 1;

create unique index if not exists focus_sessions_one_active_per_user
  on public.focus_sessions (user_id)
  where ended_at is null;
commit;
