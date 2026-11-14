begin;

-- A timestamp acts as the task's compare-and-swap revision. Rapid writes
-- can share a clock tick, and the wall clock can move backwards.
create or replace function public.schedule_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  if isfinite(old.updated_at) and new.updated_at <= old.updated_at then
    new.updated_at := old.updated_at + interval '1 microsecond';
  end if;
  return new;
end $$;

commit;
