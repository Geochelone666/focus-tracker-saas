# Production push-reminder operations

This runbook is for the Focus Tracker administrator. Run SQL only in the intended Supabase project and with project-level administrator access. **Do not paste Vault decrypted secrets, service-role keys, JWTs, raw device subscriptions, or push tokens into logs or tickets.** Do not execute `supabase/tests/*.sql` against production.

## What a healthy system proves (and what it does not)

- An active `focus-mobile-reminders` pg_cron job proves scheduling is enabled.
- `cron.job_run_details.status = succeeded` proves the SQL invocation ran, **not** that the HTTP request succeeded.
- `net._http_response.status_code = 200` proves the dispatcher returned OK, **not** that it found a due plan.
- `claimed > 0` means the dispatcher claimed delivery work.
- `accepted > 0`, or a `push_deliveries.state = sent` row for web push, means a push provider accepted the request; it does **not** guarantee phone display.
- A manually triggered test notification does **not** verify schedule matching, pg_cron, or automatically timed delivery.
- The Settings → Phone reminders → Automatic reminder history view shows the signed-in user's latest automatic attempts. It deliberately excludes manual tests.

## Safe read-only diagnostic queries

**Is the scheduled job active?**

```sql
select jobname, schedule, active
from cron.job where jobname = 'focus-mobile-reminders';
```

**Did the last two hours of pg_cron calls succeed?**

```sql
select status, count(*) as runs, max(start_time) as latest_run
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname = 'focus-mobile-reminders')
  and start_time >= now() - interval '2 hours'
group by status;
```

**Did the HTTP dispatcher accept the cron requests?** If available, `net._http_response.content` contains non-secret aggregate results such as `claimed`, `accepted`, and `receiptCheckFailed`. Do not print request headers.

```sql
select created, status_code,
       left(content::text, 200) as response_summary
from net._http_response
order by created desc limit 10;
```

**Is a phone enabled and has the app been seen recently?** This query deliberately omits endpoints, subscriptions, tokens and account IDs.

```sql
select transport, platform, enabled, lead_minutes,
       last_seen_at, last_test_at
from public.push_devices
order by last_seen_at desc limit 10;
```

**Has automatic dispatch created a delivery record?**

```sql
select state, count(*) as attempts, max(created_at) as most_recent
from public.push_deliveries
group by state order by state;
```

**Is there a future timed plan?** The database stores local date and wall-clock time. The user's IANA timezone determines the actual instant.

```sql
select count(*) as active_timed_plans
from public.schedules
where is_done = false and deleted_at is null
  and scheduled_date is not null and scheduled_time is not null;
```

## Decision tree

| Observation | Interpretation / next action |
| --- | --- |
| Cron absent or inactive | Review `supabase/mobile-push-cron.sql` and Vault secret names; do not print the secret values |
| Cron failed | Inspect the latest `cron.job_run_details.return_message` using project-admin access |
| Cron succeeded but HTTP 401 | Vault `focus_cron_secret` and Vercel `CRON_SECRET` may differ |
| Cron succeeded but HTTP 503 | Examine Vercel runtime errors and Supabase grants/RPC availability |
| HTTP 200, `claimed:0`, no future timed plan | Normal: there is no work to send |
| HTTP 200, `claimed:0`, active future plan | Check actual start time, account timezone, device lead, enabled flag, `last_seen_at` and eligibility window |
| `claimed > 0`, `accepted = 0` | Review `push_deliveries.state`/`error_code` and provider error categories; check subscription expiration |
| `sent` but phone silent | Check operating-system notification controls, Focus/Do Not Disturb, app installation and provider delay; do not treat a provider 201 as display proof |

Delivery eligibility: a timed, unfinished, non-trashed plan and an enabled phone seen within 30 days; dispatch starts at the device's configured advance time, and may catch up until one minute after plan start. A plan created only five minutes before its start with a ten-minute lead **must still be eligible** while it remains upcoming. A plan long in the past should not be delivered.

## Release and rollback discipline

1. Keep mobile code, `supabase/migrations/` and the live database aligned. Historical Supabase migration registry identifiers may differ from the committed file names if a migration was applied manually; verify actual schema/functions, not names alone.
2. Require CI lint, typecheck, SQL regressions, web build and optional mobile checks to pass before merging.
3. Verify the production alias actually points at the intended Git commit; a successful preview build is not production deployment.
4. Check only aggregate dispatcher information during live diagnosis. Never log full subscriptions, tokens, notes or task titles.
5. After changes, use a new future timed plan on a registered physical phone to confirm actual automatic delivery. Avoid replaying or sending old reminders to real users.
6. If a release regresses, revert the offending application commit and redeploy; for schema changes, use a new reviewed forward migration rather than editing previously applied migrations.
