# Planning workflow

## Upgrade an existing deployment

1. Keep the current production deployment on `main` while preparing this update.
2. In the matching Supabase project's SQL Editor, run the complete contents of `supabase/migrations/009_planning_workflow.sql`. It is transactional and can be rerun. It requires the existing migrations through 008 and the skill-ownership policy migration.
3. Confirm SQL Editor reports success. The migration preserves existing schedules, focus sessions, skills, and profiles. It adds projects, reflections, planning fields, and schedule links on sessions, and makes schedule dates optional for Inbox tasks.
4. Deploy the application update only after the database migration succeeds. This order lets the existing version keep running during migration.
5. Test the checklist below with your own test account.

## What changes

- **Today:** your local date, today's plans, carry-over, completed count, completed focus time, estimated remaining work with optional mental room for breaks, and a short reflection.
- **Inbox:** capture a title without a date. Search all tasks by title or notes, filter by status and energy, and restore removed tasks from Trash.
- **Calendar:** shared planning forms with optional priority, estimated minutes, energy level, project, skill, and repeat settings.
- **Repeat:** daily or weekly, with an explicit batch of 2–52 occurrences. Repeats do not run forever or create background jobs. Each occurrence is independent for completion. Edits can apply to one occurrence or this and future unfinished occurrences; future dates shift by the same number of days. Completed later occurrences remain unchanged.
- **Projects & Goals:** create a goal with an optional target date, add linked steps, see task progress and focus time, and mark the project complete separately.
- **Focus:** start from an open plan to link the session automatically, including its skill when selected. Stop and complete are separate actions; stopping never marks a task done automatically. Focus history survives moving a task to Trash.
- **Review:** rolling seven-day focused time, comparison with the preceding seven days, progress for plans currently dated in the review window, project allocation, latest reschedule reasons, and daily reflections.
- **Settings:** account timezone for Today, reminders, displayed session times, and analytics. CSV export retains its explicit UTC timestamps. Calendar dates are not shifted when changing timezone.
- **Theme and phone access:** light/dark preference in this browser, responsive layouts, and a web manifest for home-screen access where supported. No offline data cache is installed.

## Reminder limits

Today checks timed plans every 30 seconds and shows items due within ten minutes. Desktop notifications are optional and require the user's permission. They work only while Today remains open, and browser throttling can delay them. No email, push server, service worker, or closed-browser alarms are configured. All-day tasks do not trigger notifications. Dates and times are interpreted in the user's saved timezone; an invalid/nonexistent DST wall time should be rescheduled by the user.

The reminder window follows elapsed minutes across daylight-saving changes. Spring-forward times that never occur do not trigger reminders; times after the jump can still be due within ten minutes. During fall-back, a repeated wall time can appear in either occurrence's reminder window. Browser notifications remain limited to once per plan/date/time per tab session.

## Safety and data semantics

Every query and mutation is scoped to the authenticated owner. Database policies additionally enforce owner checks for linked projects, skills, and schedules. Series edits use a transaction inside a SECURITY INVOKER function, preserving RLS and preventing partial series updates. Trash is a reversible soft deletion, not permanent erasure. Project totals reflect the task's current project assignment; moving a task between projects reassigns its historical time in the report.

Daily statistics assign an entire session to its start date, consistent with the existing app. A session crossing midnight is not split. Running sessions are shown by the live timer and are excluded from saved-time totals until stopped. Review completion counts use each task's current date/status, not immutable historical snapshots.

## Functional checklist

- Capture a title-only Inbox task, add a date, edit notes, complete, reopen, and reload.
- Create three daily or weekly occurrences. Complete the last one, edit the first using future scope, and confirm only unfinished occurrences shift.
- Move a plan to today/tomorrow, optionally record why, send it back to Inbox, move it to Trash and restore it.
- Create a project, link a task and skill, start/stop focus, and check project and skill totals. An already running session should prevent a second Start.
- Save a reflection and change timezone. Check Today, Calendar, History and Review consistently use it.
- Enable browser notifications only if desired. Confirm all-day and completed/removed plans do not trigger reminders.
- Check phone layout and theme switching.

`supabase/tests/planning_workflow.sql` provides transactional ownership and series-edit regression checks. It needs two existing test accounts and rolls its fixture changes back. Local database validation is independent of live Supabase project credentials; live deployment readiness still requires applying the migration and testing your actual authentication/project configuration.

## Validation for this update

The update passed 201 unit tests, TypeScript checking, lint, and a production build. PostgreSQL-compatible local regression checks exercised the migration, RLS ownership, reversible removal, and atomic series edits. Browser checks used isolated local API fixtures (not the production Supabase project) and covered all screens, task capture/completion/reopening/moving, linked focus start/stop, Trash restore, project creation, timezone/theme persistence, mobile layout, daily recurrence creation (weekly recurrence is covered by unit tests), future edits preserving completed occurrences, failed-save input retention and retry, reflection persistence, and the home-screen manifest. Live deployment still requires applying migration 009 and checking the actual project configuration with a test account.

Migration 009 was also applied twice locally to check that reapplying it is supported.
