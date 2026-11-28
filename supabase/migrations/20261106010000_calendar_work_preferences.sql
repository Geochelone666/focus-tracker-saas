-- Persist owner-controlled work hours and bind new previews to their exact revision.
begin;
create table public.calendar_work_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 starts time not null, finishes time not null,
 revision bigint not null check(revision>0),
 check(starts<finishes and finishes<time '24:00' and extract(second from starts)=0 and extract(second from finishes)=0)
);
alter table public.calendar_work_preferences enable row level security;
create policy work_preferences_read on public.calendar_work_preferences for select to authenticated using((select auth.uid())=user_id);
revoke all on public.calendar_work_preferences from public,anon,authenticated;
grant select on public.calendar_work_preferences to authenticated;

create function public.save_calendar_work_preferences(p_start time,p_end time,p_expected bigint,p_timezone text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); current_revision bigint; zone text;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_start is null or p_end is null or p_start>=p_end or p_end>=time '24:00' or extract(second from p_start)<>0 or extract(second from p_end)<>0 or p_expected is null or p_expected<0 then
  raise exception 'Invalid work hours' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,1029));
 select z.name into zone from public.profiles p join pg_catalog.pg_timezone_names z on z.name=p.timezone where p.user_id=owner_id for share of p;
 if zone is distinct from p_timezone or zone is null then raise exception 'Timezone changed' using errcode='40001'; end if;
 select revision into current_revision from public.calendar_work_preferences where user_id=owner_id for update;
 if coalesce(current_revision,0)<>p_expected then raise exception 'Work hours changed' using errcode='40001'; end if;
 insert into public.calendar_work_preferences(user_id,starts,finishes,revision) values(owner_id,p_start,p_end,p_expected+1)
 on conflict(user_id) do update set starts=excluded.starts,finishes=excluded.finishes,revision=excluded.revision;
 return jsonb_build_object('start',to_char(p_start,'HH24:MI'),'end',to_char(p_end,'HH24:MI'),'revision',(p_expected+1)::text);
end $$;
revoke all on function public.save_calendar_work_preferences(time,time,bigint,text) from public,anon,authenticated;
grant execute on function public.save_calendar_work_preferences(time,time,bigint,text) to authenticated;

alter table public.calendar_plan_drafts
 add column work_revision bigint check(work_revision>0),
 add column schema_version text check(schema_version='smart-calendar/v0.1'),
 add column input_fingerprint text check(input_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
 add column base_version_id uuid;

-- Internal validator, also used for legacy drafts once the owner has saved hours.
create function public.validate_calendar_work_windows(p_owner uuid,p_windows jsonb,p_timezone text,p_expected bigint)
returns void language plpgsql security invoker set search_path='' as $$
declare prefs public.calendar_work_preferences%rowtype; w jsonb; begins timestamptz; ends timestamptz; day date;
begin
 select * into prefs from public.calendar_work_preferences where user_id=p_owner for share;
 if p_expected is not null and prefs.revision is distinct from p_expected then raise exception 'Work hours changed; regenerate preview' using errcode='40001'; end if;
 if prefs.user_id is null then return; end if;
 if jsonb_typeof(p_windows) is distinct from 'array' or jsonb_array_length(p_windows) not between 1 and 14 then
  raise exception 'Invalid work windows' using errcode='22023'; end if;
 for w in select value from jsonb_array_elements(p_windows) loop
  begins:=(w->>'start_at')::timestamptz; ends:=(w->>'end_at')::timestamptz;
  day:=(begins at time zone p_timezone)::date;
  if begins is distinct from ((day+prefs.starts) at time zone p_timezone)
     or ends is distinct from ((day+prefs.finishes) at time zone p_timezone)
     or (begins at time zone p_timezone)::time is distinct from prefs.starts
     or (ends at time zone p_timezone)::time is distinct from prefs.finishes then
   raise exception 'Work windows differ from saved hours' using errcode='40001'; end if;
 end loop;
 if (select count(distinct value->>'start_at')<>count(*) or max(((value->>'start_at')::timestamptz at time zone p_timezone)::date)-min(((value->>'start_at')::timestamptz at time zone p_timezone)::date)>13 from jsonb_array_elements(p_windows)) then
  raise exception 'Invalid work horizon' using errcode='22023'; end if;
end $$;
revoke all on function public.validate_calendar_work_windows(uuid,jsonb,text,bigint) from public,anon,authenticated;

-- Extend the existing staging entrypoint with the canonical output metadata.
-- The fingerprint is provenance only; owner, revision, hours and task CAS are
-- independently checked and never authorized by a browser-provided digest.
create function public.stage_calendar_preview(p_changes jsonb,p_availability jsonb,p_base_revision bigint,p_timezone text,p_contract jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); draft_id uuid; current_version uuid; work_revision bigint;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_contract) is distinct from 'object' or not (p_contract ?& array['schema_version','input_fingerprint','base_version_id','work_revision'])
   or jsonb_typeof(p_contract->'work_revision') is distinct from 'string'
   or jsonb_typeof(p_contract->'input_fingerprint') is distinct from 'string'
   or p_contract->>'schema_version' is distinct from 'smart-calendar/v0.1'
   or coalesce(p_contract->>'input_fingerprint','') !~ '^sha256:[0-9a-f]{64}$'
   or coalesce(p_contract->>'work_revision','') !~ '^[1-9][0-9]*$' then
  raise exception 'Invalid preview contract' using errcode='22023'; end if;
 work_revision:=(p_contract->>'work_revision')::bigint;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,1029));
 select id into current_version from public.calendar_plan_receipts where user_id=owner_id order by confirmed_revision desc limit 1;
 if current_version is distinct from (p_contract->>'base_version_id')::uuid then raise exception 'Plan version changed' using errcode='40001'; end if;
 perform public.validate_calendar_work_windows(owner_id,p_availability,p_timezone,work_revision);
 draft_id:=public.stage_calendar_preview(p_changes,p_availability,p_base_revision,p_timezone);
 update public.calendar_plan_drafts set work_revision=(p_contract->>'work_revision')::bigint,
  schema_version=p_contract->>'schema_version',input_fingerprint=p_contract->>'input_fingerprint',base_version_id=current_version
 where id=draft_id and user_id=owner_id;
 return draft_id;
end $$;
revoke all on function public.stage_calendar_preview(jsonb,jsonb,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.stage_calendar_preview(jsonb,jsonb,bigint,text,jsonb) to authenticated;

-- Confirmation already holds the owner gate. Validate before committing its
-- receipt; any failure rolls back task edits, state revision and receipt together.
-- Idempotent receipt replay remains valid after a later preference change.
create function public.guard_calendar_receipt_work_hours() returns trigger
language plpgsql security invoker set search_path='' as $$
declare draft public.calendar_plan_drafts%rowtype;
begin
 select * into draft from public.calendar_plan_drafts where id=new.draft_id and user_id=new.user_id;
 perform public.validate_calendar_work_windows(new.user_id,draft.availability,draft.timezone,draft.work_revision);
 return new;
end $$;
revoke all on function public.guard_calendar_receipt_work_hours() from public,anon,authenticated;
create trigger calendar_receipt_work_hours before insert on public.calendar_plan_receipts
 for each row execute function public.guard_calendar_receipt_work_hours();

create or replace function public.calendar_preview_snapshot() returns jsonb
language sql stable security invoker set search_path='' as $$
with owner as (select auth.uid() as id),
tasks as materialized (
  select s.* from public.schedules s, owner o
  where s.user_id=o.id and not s.is_done and s.deleted_at is null order by s.id limit 501
), receipts as materialized (
  select r.* from public.calendar_plan_receipts r,owner o
  where r.user_id=o.id order by r.confirmed_revision desc limit 200
), accepted as (
  select distinct on (s.id) s.id, r.id as receipt_id
  from tasks s join receipts r on r.status='confirmed'
  cross join lateral jsonb_array_elements(r.after_rows) a
  where (a->>'id')::uuid=s.id and (a->>'updated_at')::timestamptz=s.updated_at
  order by s.id,r.confirmed_revision desc
)
select jsonb_build_object(
  'user_id',o.id,'captured_at',statement_timestamp(),
  'timezone',(select p.timezone from public.profiles p where p.user_id=o.id),
  'revision',coalesce((select s.revision::text from public.calendar_plan_state s where s.user_id=o.id),'0'),
  'work_preferences',(select jsonb_build_object('start',to_char(p.starts,'HH24:MI'),'end',to_char(p.finishes,'HH24:MI'),'revision',p.revision::text) from public.calendar_work_preferences p where p.user_id=o.id),
  'version_id',(select r.id from receipts r order by r.confirmed_revision desc limit 1),
  'undo_receipt_id',(select r.id from receipts r join public.calendar_plan_state s
    on s.user_id=r.user_id and s.revision=r.confirmed_revision where r.status='confirmed' limit 1),
  'has_active_focus',exists(select 1 from public.focus_sessions f where f.user_id=o.id and f.ended_at is null),
  'schedules',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from tasks t),'[]'::jsonb),
  'accepted_ids',coalesce((select jsonb_agg(a.id order by a.id) from accepted a),'[]'::jsonb),
  'lock_versions',coalesce((select jsonb_object_agg(l.schedule_id,l.created_at) from public.calendar_task_locks l join tasks t on t.id=l.schedule_id where l.user_id=o.id),'{}'::jsonb),
  'locked_ids',coalesce((select jsonb_agg(l.schedule_id order by l.schedule_id)
    from public.calendar_task_locks l join tasks t on t.id=l.schedule_id where l.user_id=o.id),'[]'::jsonb)
) from owner o where o.id is not null;
$$;
commit;
