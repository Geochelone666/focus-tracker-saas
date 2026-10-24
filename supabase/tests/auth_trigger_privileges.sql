-- Privileged trigger functions are never directly executable by browser roles.
do $$ begin
 if has_function_privilege('anon','public.handle_new_user()','execute') then raise exception 'Anonymous users can execute auth trigger'; end if;
 if has_function_privilege('authenticated','public.handle_new_user()','execute') then raise exception 'Signed-in users can execute auth trigger'; end if;
 if not exists(select 1 from pg_trigger where tgname='on_auth_user_created' and not tgisinternal) then raise exception 'Auth profile creation trigger missing'; end if;
end $$;
