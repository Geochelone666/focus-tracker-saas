-- Explicitly index the delivery schedule FK for cascade deletes and lookups.
create index if not exists push_deliveries_schedule_idx on public.push_deliveries(schedule_id);

-- Preserve per-owner access while allowing PostgreSQL to cache the auth identity per statement.
drop policy if exists push_devices_own on public.push_devices;
create policy push_devices_own on public.push_devices for all to authenticated
 using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
