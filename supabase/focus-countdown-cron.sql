-- Run in the same Supabase production project after the background-focus
-- migration has installed focus_internal.complete_expired_countdowns(integer).
-- No credentials, outbound HTTP, or privileged browser endpoint is required.
select cron.schedule(
  'focus-expired-countdowns',
  '* * * * *',
  'select focus_internal.complete_expired_countdowns();'
);
