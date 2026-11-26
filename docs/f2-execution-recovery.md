# Experimental execution recovery

This Phase 2 increment is stacked on `feat/f2-phase0-integration`. It does not
declare the Smart Calendar release gates or the full Focus 2 roadmap complete.

## User flow

With `FOCUS_EXECUTION_RECOVERY_ENABLED=true`, the day/week calendar offers
**Focus selected task** and **Review unfinished time blocks**. The focus entry
uses the existing session state machine and task/project association rules.

`/calendar/recovery` lists open tasks planned or focused on in the chosen account
timezone range, plus linked active sessions. The default is seven calendar days;
queries are limited to 31 days and pages of 25. Cross-midnight sessions overlap
the range, including 23/25-hour days. Completed focus is summed across all
sessions for each task; breaks and abandoned sessions are excluded. Missing
history stays unknown. Completing focus never completes the task.

The user can save an optional remaining estimate (1–1440 minutes) and a short
resume note, return to an active/paused session, or follow the existing calendar
and task editing flows to rearrange, postpone or complete work. Original task
notes and the last focus outcome remain visible. Exact task revision checks
reject stale-device saves while retaining the unsaved form text.

Remaining time is user-authored recovery context. It does not replace the original
estimate, automatically subtract recorded time, or feed the scheduling engine.
Automatic remaining-day suggestions and real-user acceptance remain future work.

## Deployment and rollback

1. Resolve the existing hosted migration inventory discrepancy documented in
   [the worksheet](f2-migration-worksheet.md). Do not blindly push or repair the
   production migration registry.
2. In a reconciled test environment, apply migrations in filename order through
   `20261106000000_execution_recovery.sql` (34 files on this branch). This additive
   migration adds nullable task context columns, a focus lookup index and two
   authenticated, security-invoker RPCs. Existing owner RLS stays in force.
3. Deploy the application. The feature is disabled unless the server-only flag
   `FOCUS_EXECUTION_RECOVERY_ENABLED` is exactly `true`; enable it only in the
   intended test environment after the migration succeeds.
4. Verify with two real test accounts before release. Turning the flag off and
   reverting the application hides the new flow while retaining all user context
   and history. Do not drop the new columns to roll back the application.

No new external API credentials, service-role access, AI/MCP permissions or
dependencies are introduced. Large hosted tables may need a separately reviewed
index deployment window; local tests do not establish production migration time.

## Verification

Local run on 2026-11-06: 573 tests in 53 files passed; typecheck, lint, build,
PostgreSQL 17 regressions and the 390px browser workflow below passed. The offline
migration preflight found 34 local files and no filename findings; it does not
validate the hosted registry. Browser evidence is saved by the runner as
`test-artifacts/f2-f02-recovery-mobile.png` and uploaded by the existing CI job.

- `npm test`: unit/actions plus all migrations and SQL regressions in PGlite.
- `npm run typecheck`, `npm run lint`, `npm run build`.
- `node scripts/postgres-calendar-concurrency.mjs`: disposable PostgreSQL 17;
  recovery ownership/CAS/accounting, timezone boundaries, and existing two-
  connection UPDATE/INSERT/lock competition tests.
- `PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium node scripts/e2e-focus.mjs` after
  build: real Next.js actions against migrated fixture SQL, recovery persistence,
  stale draft retention, calendar start, pause/resume/finish at 390px, and the
  existing capture → plan → focus → review workflow.

The browser uses fixture authentication, and PostgreSQL uses two SQL identities.
These checks do not verify hosted GoTrue login, Supabase/Vercel deployment, actual
devices or independent product acceptance. See [roadmap status](f2-roadmap-status.md).
