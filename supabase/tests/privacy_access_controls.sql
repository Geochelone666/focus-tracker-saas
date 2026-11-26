begin;
insert into auth.users(id,email) values
 ('b9000000-0000-4000-8000-000000000001','privacy-a@test.invalid'),
 ('b9000000-0000-4000-8000-000000000002','privacy-b@test.invalid');
insert into public.integration_tokens(user_id,name,scope,token_hash,expires_at) values
 ('b9000000-0000-4000-8000-000000000001','Owner key','read',encode(sha256(convert_to('ft_'||repeat('1',64),'UTF8')),'hex'),now()+interval '1 day'),
 ('b9000000-0000-4000-8000-000000000002','Other key','read',repeat('2',64),now()+interval '1 day');
insert into public.push_devices(id,user_id,expo_token,platform,name) values
 ('b9100000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','ExpoPushToken[PrivacyA]','android','Owner phone'),
 ('b9100000-0000-4000-8000-000000000002','b9000000-0000-4000-8000-000000000002','ExpoPushToken[PrivacyB]','android','Other phone');
insert into public.schedules(user_id,title) values
 ('b9000000-0000-4000-8000-000000000001','Keep my task');
do $$ begin
 if has_function_privilege('anon','public.revoke_account_connections()','execute') then
   raise exception 'Anonymous privacy access';
 end if;
end $$;

-- Force a failure in the second update to prove the first update rolls back.
create function public.privacy_fixture_failure() returns trigger language plpgsql as $$
begin
 if current_setting('test.privacy_failure',true)='yes' then
   raise exception 'Fixture privacy failure' using errcode='22023';
 end if;
 return new;
end $$;
create trigger privacy_fixture_failure before update of enabled on public.push_devices
for each row execute function public.privacy_fixture_failure();
set local role authenticated;
select set_config('request.jwt.claim.sub','b9000000-0000-4000-8000-000000000001',true);
select set_config('test.privacy_failure','yes',true);
do $$ begin
 begin
   perform public.revoke_account_connections();
   raise exception 'Failure accepted';
 exception when invalid_parameter_value then null;
 end;
 if exists(select 1 from public.integration_tokens where user_id=auth.uid() and revoked_at is not null) then
   raise exception 'Partial key revocation committed';
 end if;
 if exists(select 1 from public.push_devices where user_id=auth.uid() and not enabled) then
   raise exception 'Partial reminder pause committed';
 end if;
end $$;
select set_config('test.privacy_failure','no',true);
do $$ declare receipt jsonb; stamp timestamptz; begin
 receipt:=public.revoke_account_connections();
 if receipt<> '{"revoked_keys":1,"paused_devices":1}'::jsonb then raise exception 'Invalid privacy receipt'; end if;
 select revoked_at into stamp from public.integration_tokens where user_id=auth.uid();
 if stamp is null then raise exception 'Key still active'; end if;
 if public.revoke_account_connections()<> '{"revoked_keys":0,"paused_devices":0}'::jsonb then raise exception 'Retry changed state'; end if;
 if (select revoked_at from public.integration_tokens where user_id=auth.uid()) is distinct from stamp then
   raise exception 'Retry replaced revocation time';
 end if;
 if (select count(*) from public.schedules where user_id=auth.uid() and title='Keep my task')<>1 then raise exception 'Task removed'; end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 begin
   perform public.revoke_account_connections();
   raise exception 'Missing identity accepted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
set local role anon;
do $$ begin
 if (public.integration_api('ft_'||repeat('1',64),'list_schedules','{}')->>'status')::integer<>401 then
   raise exception 'Revoked key still grants access';
 end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.integration_tokens where user_id='b9000000-0000-4000-8000-000000000002' and revoked_at is not null)
   or exists(select 1 from public.push_devices where user_id='b9000000-0000-4000-8000-000000000002' and not enabled)
 then raise exception 'Other owner changed'; end if;
end $$;
rollback;
