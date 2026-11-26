begin;

create function public.revoke_account_connections() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  key_count integer;
  device_count integer;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  update public.integration_tokens set revoked_at = statement_timestamp()
    where user_id = owner_id and revoked_at is null;
  get diagnostics key_count = row_count;
  update public.push_devices set enabled = false
    where user_id = owner_id and enabled;
  get diagnostics device_count = row_count;
  return jsonb_build_object('revoked_keys', key_count, 'paused_devices', device_count);
end $$;

revoke all on function public.revoke_account_connections() from public, anon;
grant execute on function public.revoke_account_connections() to authenticated;

commit;
