-- Optional scheduler for hosted Supabase. Apply AFTER the mobile push migration.
-- First create TWO Vault secrets in Supabase: focus_app_origin and focus_cron_secret.
-- focus_app_origin is your HTTPS origin, without trailing slash.
-- focus_cron_secret must match Vercel CRON_SECRET (at least 32 random characters).
-- Never paste actual secrets into a committed SQL file.
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='focus_app_origin')
 or not exists(select 1 from vault.decrypted_secrets where name='focus_cron_secret') then
  raise exception 'Create focus_app_origin and focus_cron_secret in Vault first';
 end if;
 if exists(select 1 from cron.job where jobname='focus-mobile-reminders') then
  perform cron.unschedule('focus-mobile-reminders');
 end if;
end $$;
select cron.schedule('focus-mobile-reminders','* * * * *',$job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='focus_app_origin' limit 1)||'/api/push/dispatch',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='focus_cron_secret' limit 1)),
  body := '{}'::jsonb, timeout_milliseconds := 60000
 );
$job$);
