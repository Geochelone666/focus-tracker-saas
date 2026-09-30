-- Run after the ownership migration. Every fixture is rolled back.
begin;
insert into auth.users(id, email) values
  ('a1111111-1111-4111-8111-111111111111', 'focus-qa-rls-a@example.invalid'),
  ('b2222222-2222-4222-8222-222222222222', 'focus-qa-rls-b@example.invalid');
insert into public.skills(id, user_id, name) values
  ('c3333333-3333-4333-8333-333333333333', 'b2222222-2222-4222-8222-222222222222', 'Foreign skill'),
  ('d4444444-4444-4444-8444-444444444444', 'a1111111-1111-4111-8111-111111111111', 'Own skill');
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if exists (select 1 from public.skills) or exists (select 1 from public.focus_sessions) or exists (select 1 from public.profiles) then
    raise exception 'Anonymous users can read private rows';
  end if;
end;
$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);

-- Own links and no skill must still work.
insert into public.focus_sessions(id, user_id, skill_id, started_at, ended_at, duration_sec) values
  ('e5555555-5555-4555-8555-555555555555', 'a1111111-1111-4111-8111-111111111111', 'd4444444-4444-4444-8444-444444444444', now(), now(), 0),
  ('f6666666-6666-4666-8666-666666666666', 'a1111111-1111-4111-8111-111111111111', null, now(), now(), 0);
do $$
begin
  begin
    insert into public.focus_sessions(user_id, skill_id, started_at)
      values ('a1111111-1111-4111-8111-111111111111', 'c3333333-3333-4333-8333-333333333333', now());
    raise exception 'Foreign skill INSERT was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.focus_sessions set skill_id = 'c3333333-3333-4333-8333-333333333333'
      where id = 'e5555555-5555-4555-8555-555555555555';
    raise exception 'Foreign skill UPDATE was accepted';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.skills where user_id = 'b2222222-2222-4222-8222-222222222222') then
    raise exception 'Foreign skills are visible';
  end if;
end;
$$;
-- Duplicate Starts must leave exactly one active session.
insert into public.focus_sessions(user_id, started_at)
  values ('a1111111-1111-4111-8111-111111111111', now());
do $$
begin
  begin
    insert into public.focus_sessions(user_id, started_at)
      values ('a1111111-1111-4111-8111-111111111111', now());
    raise exception 'Duplicate Start was accepted';
  exception when unique_violation then null;
  end;
  begin
    update public.focus_sessions set user_id = 'b2222222-2222-4222-8222-222222222222'
      where id = 'e5555555-5555-4555-8555-555555555555';
    raise exception 'Session ownership transfer was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
-- Deleting an own skill must preserve history and null the association.
delete from public.skills where id = 'd4444444-4444-4444-8444-444444444444';
do $$
begin
  if not exists (select 1 from public.focus_sessions where id = 'e5555555-5555-4555-8555-555555555555' and skill_id is null) then
    raise exception 'Skill deletion did not preserve session';
  end if;
end;
$$;
reset role;
select 'skill ownership, isolation and deletion checks passed' as result;
rollback;
