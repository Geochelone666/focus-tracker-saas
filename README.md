# Focus Tracker

A personal focus and planning app built with Next.js 15, React 19, TypeScript, Tailwind CSS, and Supabase authentication and PostgreSQL.

## Features

- Email/password signup and login, including email confirmation guidance.
- Protected dashboard with count-up/countdown focus, persisted pause/resume, outcome notes, preserved abandoned sessions, daily goals, and seven-day statistics.
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

Apply the SQL migrations in `supabase/migrations/` using the project's migration workflow; see [migration instructions](supabase/migrations/README.md). Existing deployments upgrading to calendar support need `008_create_schedules.sql` applied once. The expanded planning workflow additionally requires `009_planning_workflow.sql` before deploying the application update. Every deployment must also apply `20261022000000_restore_session_schedule_ownership.sql`: in file-name order the earlier `20260930002658` migration overwrote 009's focus-session policies and dropped the check that a linked schedule belongs to the user. See [upgrade instructions and feature details](docs/planning-workflow.md). Row-level security restricts data to the authenticated owner.

```bash
npm run dev
```

Visit the local server on port 3000. For cloud development, use `npm run dev -- --hostname 0.0.0.0`. If the default npm cache is not writable, install with `npm ci --cache /workspace/.npm-cache`.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL; the app and middleware throw at startup without it |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/publishable key (never the service role key) |

CI builds with the placeholder values `https://example.supabase.co` / `example-anon-key`. See [CHANGELOG](CHANGELOG.md) for recent changes.

## Validation

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Unit tests cover validation, analytics, pagination, session concurrency, authentication actions, schedule creation and edits, recurrence, inbox capture, timezone boundaries, reminders, task-linked focus, soft deletion, and ownership filters. They do not replace live Supabase authentication or database policy verification. The SQL regression checks in `supabase/tests/` run automatically: `lib/migrations.test.ts` applies every migration in file-name order to an in-memory PGlite database and executes them. You can also run them in the Supabase SQL Editor against a real project.

A browser end-to-end check (`scripts/e2e-auth.mjs`, Playwright) covers the auth guard without a real Supabase project: every protected page and `/history/export` redirects to `/login` when signed out, a forged session cookie is rejected, and a login attempt while Supabase is unreachable shows a readable message. Build and start against an unreachable Supabase, then run it:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm start
BASE_URL=http://localhost:3000 npm run test:e2e   # in another terminal
```

The first run needs `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_PATH` to an existing Chromium. CI runs it after the main job.

## Dates and time

Daily statistics, Today, reminders, and displayed session history use the timezone saved in Settings (America/Toronto by default). Calendar dates and optional times are stored as entered, without UTC conversion. CSV export uses UTC timestamps. Schedules without a time display **All day**. Completed schedules remain available and can be reopened.

## Deployment

Push to `main` to trigger the connected Vercel deployment. Configure the Supabase environment variables in Vercel and apply database migrations to the matching Supabase project before using database features. Verify the deployment is Ready and test login, schedule creation, edit/reschedule, completion and undo, and persistence after refresh with a test account.

Dependency versions are locked. Next.js and its ESLint configuration are aligned, with patched PostCSS and source-map-js overrides. Check `npm audit --omit=dev` periodically; an audit result describes known advisories at the time of the check, not a guarantee against all vulnerabilities.

The current full development-dependency audit still reports seven high-severity entries through braces (the registry currently has no patched release). Production dependency audit reports zero known advisories. Avoid processing untrusted glob patterns in development tools, and recheck for upstream fixes. Vitest is updated to 4.1.12.

## Devices and AI clients

The integration update requires migration **20261023000000** before deployment. Settings → Manage AI connections lets you create expiring, revocable read-only or schedule-editing keys. REST/OpenAPI and stateless MCP endpoints share owner isolation, revision checks, and a write log. Visible idle pages refresh across devices. See [setup, supported transports, limitations, and examples](docs/ai-connections.md).

## Focus V1 delivery

Batch 1 adds database-authoritative focus timing, pause/resume, custom countdowns, and concurrent-device conflict checks on Today and Dashboard. Apply migration `20261024000000_focus_state.sql` after all previous migrations before deploying. See [audit and ordered delivery queue](docs/v1-audit.md) and [state model, validation and rollback](docs/focus-state.md). Break cycles, day/week time blocks and full planned/actual analysis are subsequent batches; hosted Supabase behavior remains unverified.

Focus V1 batches 2–3 add configurable short/long breaks and bounded cycles, opt-in alerts, and [day/week time blocking with versioned task saves](docs/time-blocking.md). Apply the later migrations in filename order (`20261024010000_focus_cycles.sql`, `20261024020000_time_blocks.sql`) before using these branches. Local browser fixtures exercise the workflow without real credentials; they do not establish production readiness.

The final V1 branch adds [planned versus actual review](docs/planned-actual.md): 7/30/custom windows, effective interval allocation across local days/DST, separate breaks, ID-based project/skill totals, task variance and truthful missing-data states. Apply `20261024030000_planned_actual.sql` after the earlier V1 migrations. Existing historical sessions without interval details are explicitly labelled rather than reconstructed. See [validation and remaining hosted acceptance checks](docs/validation-v1.md).
