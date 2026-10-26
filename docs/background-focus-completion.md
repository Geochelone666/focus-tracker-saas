# Background countdown completion

Focus Tracker's browser timer automatically finalizes a countdown when its UI is
open. For a reliable background workflow, the database also checks expired
**running** countdowns once per minute. A closed tab, offline phone or suspended
PWA does not block the session from completing.

## Deploying

1. Apply `supabase/migrations/20261025070000_background_focus_completion.sql`
   using the normal migration workflow. It only installs the protected
   `focus_internal.complete_expired_countdowns` function; it does **not**
   schedule a job by itself.
2. In the same **production** project, apply `supabase/focus-countdown-cron.sql`
   once to register the named pg_cron job. It is safe to re-run; pg_cron uses
   the job name to update an existing schedule.
3. Confirm the job is active and inspect a representative test with a rollback:

```sql
select jobname,schedule,active from cron.job
where jobname='focus-expired-countdowns';
select status,max(start_time) as latest,count(*)
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname='focus-expired-countdowns')
  and start_time>=now()-interval '1 hour'
group by status;
```

## Semantics

- Only the database owner can execute the scheduler's private function.
- Only sessions with `focus_mode = countdown`, `focus_status = running`,
  `ended_at IS NULL`, and an actually expired remaining time are processed.
- Paused sessions are never completed solely because the wall clock advances.
- The existing immutable server-side accounting trigger caps focus duration at
  the target, and the interval recorder closes the effective focus segment.
- Already completed sessions are ignored, so repeated scheduler invocations
  are idempotent. `FOR UPDATE SKIP LOCKED` avoids waiting for foreground
  pause/completion transitions. Up to 100 sessions can be processed per tick.
- There are no push notifications, user-specific content, external requests,
  or service keys in this job. The existing phone schedule reminder job remains
  independent.
- A countdown completes within the next successful 1-minute tick, not
  necessarily at the exact millisecond of its target. The stored credited
  duration is still capped to the user-configured time.

## Rollback / control

Disable without dropping data:

```sql
select cron.unschedule('focus-expired-countdowns');
```

After disabling, browsers can still finish countdowns as before. Do not drop
the underlying function while cron is active.
