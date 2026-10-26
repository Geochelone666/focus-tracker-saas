-- Automatically settle expired running countdowns even when every browser is closed.
-- The session guard computes authoritative elapsed time; the interval trigger
-- records only the eligible countdown duration, excluding pauses and breaks.
begin;
create schema if not exists focus_internal;
revoke all on schema focus_internal from public,anon,authenticated;

create or replace function focus_internal.complete_expired_countdowns(p_limit integer default 100)
returns integer
language plpgsql security invoker set search_path='' as $$
declare
  settled integer;
begin
  -- Called only by pg_cron as the database owner. It must not be accessible
  -- through the exposed REST API or from a signed-in user's SQL role.
  if current_user <> 'postgres' then
    raise exception 'Only the database scheduler may finalize countdowns' using errcode='42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Invalid countdown batch size';
  end if;

  with eligible as materialized (
    select f.id
    from public.focus_sessions f
    where f.ended_at is null
      and f.focus_status = 'running'
      and f.focus_mode = 'countdown'
      and f.target_seconds is not null
      and f.resumed_at is not null
      and f.resumed_at +
          greatest(0, f.target_seconds::bigint * 1000 - f.accumulated_ms)
            * interval '1 millisecond' <= clock_timestamp()
    order by f.resumed_at,f.id
    for update of f skip locked
    limit p_limit
  ), updated as (
    update public.focus_sessions f
       set focus_status='completed'
      from eligible e
     where f.id=e.id
       and f.ended_at is null and f.focus_status='running'
    returning f.id
  )
  select count(*)::integer into settled from updated;
  return settled;
end
$$;
revoke all on function focus_internal.complete_expired_countdowns(integer) from public,anon,authenticated;
commit;
