# Focus Tracker

A personal focus and planning app built with Next.js 15, React 19, TypeScript, Tailwind CSS, and Supabase authentication and PostgreSQL.

## Features

- Email/password signup and login, including email confirmation guidance.
- Protected dashboard with focus sessions, running timer, stale-session recovery, daily goals, and seven-day statistics.
- Personal skill checklist with per-skill focus totals.
- Paginated session history and CSV export.
- Today workspace, Inbox capture, searchable task views, reversible Trash, and monthly calendar.
- Priority, time estimates, energy filters, project/skill links, and bounded daily/weekly repeats with future-occurrence edits.
- Projects and goals, task-linked focus sessions, daily reflections, and weekly review.
- In-app reminders and optional browser notifications while Today is open.
- Account timezone settings, light/dark theme, and a home-screen web manifest.
- Edit schedule details or move a schedule to another date using **Edit or reschedule**.
- English interface, responsive layouts, accessible labels, and pending feedback on schedule saves.

## Project status

The original MVP scope has expanded into the planning workflow described above. Authentication, focus sessions, analytics, skill tracking, and automated regression tests are implemented in the repository. The stack is Next.js 15 and React 19; older descriptions referring to Next.js 14 or planned tests describe an earlier version.

Deployment acceptance still requires a matching Supabase project with migrations applied and live checks of authentication, ownership policies, and persistence. Passing unit tests or CI alone does not establish those deployment checks. See the deployment section below and [planning workflow](docs/planning-workflow.md).

## Local development

Use Node.js 20.19 or newer (production uses Node.js 24) and npm.

```bash
npm ci
cp .env.example .env.local
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for your Supabase project in `.env.local`. Do not commit credentials or use a service role key in the browser. Existing local configuration should be preserved.

Apply the SQL migrations in `supabase/migrations/` using the project's migration workflow; see [migration instructions](supabase/migrations/README.md). Existing deployments upgrading to calendar support need `008_create_schedules.sql` applied once. The expanded planning workflow additionally requires `009_planning_workflow.sql` before deploying the application update. See [upgrade instructions and feature details](docs/planning-workflow.md). Row-level security restricts data to the authenticated owner.

```bash
npm run dev
```

Visit the local server on port 3000. For cloud development, use `npm run dev -- --hostname 0.0.0.0`. If the default npm cache is not writable, install with `npm ci --cache /workspace/.npm-cache`.

## Validation

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Unit tests cover validation, analytics, pagination, session concurrency, authentication actions, schedule creation and edits, recurrence, inbox capture, timezone boundaries, reminders, task-linked focus, soft deletion, and ownership filters. They do not replace live Supabase authentication or database policy verification. The SQL ownership regression check is in `supabase/tests/session_skill_ownership.sql`.

## Dates and time

Daily statistics, Today, reminders, and displayed session history use the timezone saved in Settings (America/Toronto by default). Calendar dates and optional times are stored as entered, without UTC conversion. CSV export uses UTC timestamps. Schedules without a time display **All day**. Completed schedules remain available and can be reopened.

## Deployment

Push to `main` to trigger the connected Vercel deployment. Configure the Supabase environment variables in Vercel and apply database migrations to the matching Supabase project before using database features. Verify the deployment is Ready and test login, schedule creation, edit/reschedule, completion and undo, and persistence after refresh with a test account.

Dependency versions are locked. Next.js and its ESLint configuration are aligned, with patched PostCSS and source-map-js overrides. Check `npm audit --omit=dev` periodically; an audit result describes known advisories at the time of the check, not a guarantee against all vulnerabilities.

The current full development-dependency audit still reports seven high-severity entries through braces (the registry currently has no patched release). Production dependency audit reports zero known advisories. Avoid processing untrusted glob patterns in development tools, and recheck for upstream fixes. Vitest is updated to 4.1.12.
