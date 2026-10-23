begin;
create table if not exists public.integration_tokens (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 1 and 80), token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
 scope text not null check (scope in ('read','write')), created_at timestamptz not null default now(),
 expires_at timestamptz not null, revoked_at timestamptz, last_used_at timestamptz,
 window_start timestamptz not null default now(), request_count integer not null default 0
);
alter table public.integration_tokens enable row level security;
drop policy if exists tokens_own on public.integration_tokens;
create policy tokens_own on public.integration_tokens for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
revoke all on public.integration_tokens from anon, authenticated;
grant select(id,user_id,name,scope,created_at,expires_at,revoked_at,last_used_at), insert(user_id,name,token_hash,scope,expires_at), update(revoked_at) on public.integration_tokens to authenticated;
create table if not exists public.integration_activity (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 token_id uuid references public.integration_tokens(id), operation text not null, schedule_id uuid, created_at timestamptz not null default now()
);
alter table public.integration_activity enable row level security;
drop policy if exists activity_own on public.integration_activity;
create policy activity_own on public.integration_activity for select to authenticated using (user_id=auth.uid());
revoke all on public.integration_activity from anon, authenticated;
grant select on public.integration_activity to authenticated;
alter table public.schedules add column if not exists updated_at timestamptz not null default now();
create or replace function public.schedule_revision() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=clock_timestamp(); return new; end $$;
drop trigger if exists schedule_revision on public.schedules;
create trigger schedule_revision before update on public.schedules for each row execute function public.schedule_revision();

-- This is the only anonymous entry point. It validates an unguessable bearer token,
-- enforces owner/scope/expiry/rate limits, and never accepts a caller-supplied owner.
create or replace function public.integration_api(p_token text, p_operation text, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.integration_tokens%rowtype; s public.schedules%rowtype; result jsonb; lim integer; offst integer;
begin
 if p_token is null or p_token !~ '^ft_[a-f0-9]{64}$' then return jsonb_build_object('status',401,'error','Invalid or expired access key'); end if;
 select * into t from public.integration_tokens where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or t.revoked_at is not null or t.expires_at <= now() then return jsonb_build_object('status',401,'error','Invalid or expired access key'); end if;
 if t.window_start > now()-interval '1 minute' and t.request_count >= 60 then return jsonb_build_object('status',429,'error','Rate limit exceeded. Retry in 60 seconds'); end if;
 update public.integration_tokens set last_used_at=now(), window_start=case when window_start <= now()-interval '1 minute' then now() else window_start end,
 request_count=case when window_start <= now()-interval '1 minute' then 1 else request_count+1 end where id=t.id;
 if p_operation is null or p_operation not in ('list_schedules','get_schedule','list_projects','get_profile','create_schedule','update_schedule') then return jsonb_build_object('status',400,'error','Unknown operation'); end if;
 if p_operation in ('create_schedule','update_schedule') and t.scope <> 'write' then return jsonb_build_object('status',403,'error','This key is read-only'); end if;
 -- A subtransaction keeps validation failures from rolling back rate accounting.
 begin
 if p_operation='list_schedules' then
  lim=least(greatest(coalesce((p_data->>'limit')::integer,50),1),100); offst=greatest(coalesce((p_data->>'offset')::integer,0),0);
  select coalesce(jsonb_agg(to_jsonb(q)-'user_id'),'[]') into result from (
   select * from public.schedules where user_id=t.user_id
    and (coalesce((p_data->>'trash')::boolean,false) = (deleted_at is not null))
    and (not (p_data ? 'is_done') or is_done=(p_data->>'is_done')::boolean)
    and (not (p_data ? 'from') or scheduled_date >= (p_data->>'from')::date)
    and (not (p_data ? 'to') or scheduled_date <= (p_data->>'to')::date)
    and (not coalesce((p_data->>'inbox')::boolean,false) or scheduled_date is null)
   order by scheduled_date nulls first, id limit lim offset offst
  ) q;
 elsif p_operation='list_projects' then
  select coalesce(jsonb_agg(to_jsonb(q)-'user_id'),'[]') into result from (
   select * from public.projects where user_id=t.user_id order by id limit 100 offset greatest(coalesce((p_data->>'offset')::integer,0),0)
  ) q;
 elsif p_operation='get_profile' then
  select jsonb_build_object('timezone',timezone,'daily_focus_target_minutes',daily_focus_target_minutes) into result from public.profiles where user_id=t.user_id;
  result=coalesce(result,jsonb_build_object('timezone','America/Toronto','daily_focus_target_minutes',null));
 elsif p_operation='get_schedule' then
  select to_jsonb(x)-'user_id' into result from public.schedules x where id=(p_data->>'id')::uuid and user_id=t.user_id;
  if result is null then return jsonb_build_object('status',404,'error','Schedule not found'); end if;
 else
  if p_operation='update_schedule' then
   select * into s from public.schedules where id=(p_data->>'id')::uuid and user_id=t.user_id for update;
   if not found then return jsonb_build_object('status',404,'error','Schedule not found'); end if;
   if not (p_data ? 'expected_updated_at') or (p_data->>'expected_updated_at')::timestamptz is distinct from s.updated_at then
    return jsonb_build_object('status',409,'error','Schedule changed. Fetch it again before editing');
   end if;
  else s.id=gen_random_uuid(); s.user_id=t.user_id; s.priority='normal'; s.is_done=false; s.created_at=now(); s.updated_at=now(); end if;
  select * into s from jsonb_populate_record(s, p_data - array['id','user_id','created_at','updated_at','expected_updated_at','series_id','completed_at','deleted_at']);
  if p_data ? 'trashed' then s.deleted_at=case when (p_data->>'trashed')::boolean then now() else null end; end if;
  if s.title is null or char_length(btrim(s.title)) not between 1 and 120 or s.is_done is null or s.priority is null then raise exception 'Invalid schedule'; end if;
  if s.project_id is not null and not exists(select 1 from public.projects where id=s.project_id and user_id=t.user_id) then raise exception 'Invalid project'; end if;
  if s.skill_id is not null and not exists(select 1 from public.skills where id=s.skill_id and user_id=t.user_id) then raise exception 'Invalid skill'; end if;
  s.completed_at=case when s.is_done then coalesce(s.completed_at,now()) else null end;
  if p_operation='create_schedule' then
   insert into public.schedules(id,user_id,title,scheduled_date,scheduled_time,notes,priority,estimated_minutes,energy,project_id,skill_id,is_done,completed_at)
   values(s.id,t.user_id,btrim(s.title),s.scheduled_date,s.scheduled_time,s.notes,s.priority,s.estimated_minutes,s.energy,s.project_id,s.skill_id,s.is_done,s.completed_at) returning * into s;
  else
   update public.schedules set title=btrim(s.title),scheduled_date=s.scheduled_date,scheduled_time=s.scheduled_time,notes=s.notes,priority=s.priority,
    estimated_minutes=s.estimated_minutes,energy=s.energy,project_id=s.project_id,skill_id=s.skill_id,is_done=s.is_done,completed_at=s.completed_at,deleted_at=s.deleted_at
    where id=s.id and user_id=t.user_id returning * into s;
  end if;
  insert into public.integration_activity(user_id,token_id,operation,schedule_id) values(t.user_id,t.id,p_operation,s.id);
  result=to_jsonb(s)-'user_id';
 end if;
 return jsonb_build_object('status',200,'data',result);
 exception when others then return jsonb_build_object('status',400,'error','Invalid request. Check field types, dates, and linked project/skill ownership'); end;
end $$;
revoke all on function public.integration_api(text,text,jsonb) from public, authenticated;
grant execute on function public.integration_api(text,text,jsonb) to anon;
commit;
