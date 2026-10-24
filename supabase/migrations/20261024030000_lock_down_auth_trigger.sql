-- The auth.users trigger invokes this function internally.
-- Public clients must not be granted direct RPC execution of a privileged trigger function.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
