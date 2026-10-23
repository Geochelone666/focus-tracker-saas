-- Run as a database administrator after the AI integration migration in a test project with two auth users.
-- All fixture changes are rolled back. Keys below are disposable test values.
begin;
do $$ begin if (select count(*) from auth.users)<2 then raise exception 'Two existing test accounts required'; end if; end $$;
select set_config('test.owner',(select id::text from auth.users order by id limit 1),true);
select set_config('test.other',(select id::text from auth.users order by id offset 1 limit 1),true);
insert into public.integration_tokens(user_id,name,token_hash,scope,expires_at) values
 (current_setting('test.owner')::uuid,'QA write',encode(sha256(convert_to('ft_'||repeat('a',64),'UTF8')),'hex'),'write',now()+interval '1 day'),
 (current_setting('test.owner')::uuid,'QA read',encode(sha256(convert_to('ft_'||repeat('b',64),'UTF8')),'hex'),'read',now()+interval '1 day'),
 (current_setting('test.owner')::uuid,'QA expired',encode(sha256(convert_to('ft_'||repeat('c',64),'UTF8')),'hex'),'write',now()-interval '1 day');
insert into public.projects(id,user_id,name) values('a2222222-2222-4222-8222-222222222222',current_setting('test.other')::uuid,'Foreign QA project');
insert into public.schedules(id,user_id,title) values('c2222222-2222-4222-8222-222222222222',current_setting('test.other')::uuid,'Foreign QA task');
set local role anon;
do $$ declare r jsonb; s jsonb; k text='ft_'||repeat('a',64); begin
 if (public.integration_api('bad','list_schedules')->>'status')::integer<>401 then raise exception 'Bad key accepted'; end if;
 if (public.integration_api('ft_'||repeat('c',64),'list_schedules')->>'status')::integer<>401 then raise exception 'Expired key accepted'; end if;
 if (public.integration_api('ft_'||repeat('b',64),'create_schedule','{"title":"Denied"}')->>'status')::integer<>403 then raise exception 'Read key wrote'; end if;
 if (public.integration_api(k,'get_schedule','{"id":"c2222222-2222-4222-8222-222222222222"}')->>'status')::integer<>404 then raise exception 'Foreign row visible'; end if;
 if (public.integration_api(k,'create_schedule','{"title":"Bad link","project_id":"a2222222-2222-4222-8222-222222222222"}')->>'status')::integer<>400 then raise exception 'Foreign project linked'; end if;
 r=public.integration_api(k,'create_schedule','{"title":"AI QA task"}');
 if (r->>'status')::integer<>200 then raise exception 'Create failed: %',r; end if;
 s=r->'data';
 if s ? 'user_id' then raise exception 'Owner metadata exposed'; end if;
 r=public.integration_api(k,'update_schedule',jsonb_build_object('id',s->>'id','is_done',true));
 if (r->>'status')::integer<>409 then raise exception 'Unversioned update accepted'; end if;
 r=public.integration_api(k,'update_schedule',jsonb_build_object('id',s->>'id','expected_updated_at',s->>'updated_at','is_done',true));
 if (r->>'status')::integer<>200 or not (r->'data'->>'is_done')::boolean then raise exception 'Complete failed'; end if;
 if (public.integration_api(k,'update_schedule',jsonb_build_object('id',s->>'id','expected_updated_at',s->>'updated_at','title','Stale'))->>'status')::integer<>409 then raise exception 'Stale edit accepted'; end if;
 s=r->'data';
 r=public.integration_api(k,'update_schedule',jsonb_build_object('id',s->>'id','expected_updated_at',s->>'updated_at','trashed',true));
 if (r->>'status')::integer<>200 or r->'data'->>'deleted_at' is null then raise exception 'Trash failed'; end if;
 s=r->'data';
 r=public.integration_api(k,'update_schedule',jsonb_build_object('id',s->>'id','expected_updated_at',s->>'updated_at','trashed',false));
 if (r->>'status')::integer<>200 or r->'data'->>'deleted_at' is not null then raise exception 'Restore failed'; end if;
end $$;
reset role;
do $$ begin if (select count(*) from public.integration_activity where token_id in (select id from public.integration_tokens where name='QA write'))<>4 then raise exception 'Audit missing'; end if; end $$;
update public.integration_tokens set request_count=60,window_start=now() where name='QA write';
set local role anon;
do $$ begin if (public.integration_api('ft_'||repeat('a',64),'list_schedules')->>'status')::integer<>429 then raise exception 'Rate limit missing'; end if; end $$;
reset role;
update public.integration_tokens set revoked_at=now() where name='QA write';
set local role anon;
do $$ begin if (public.integration_api('ft_'||repeat('a',64),'list_schedules')->>'status')::integer<>401 then raise exception 'Revoked key accepted'; end if; end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$ begin
 if exists(select 1 from public.integration_tokens where name like 'QA %') then raise exception 'Foreign key metadata visible'; end if;
 begin perform token_hash from public.integration_tokens; raise exception 'Hashes selectable'; exception when insufficient_privilege then null; end;
 begin update public.integration_tokens set scope='write'; raise exception 'Scopes mutable'; exception when insufficient_privilege then null; end;
end $$;
rollback;
