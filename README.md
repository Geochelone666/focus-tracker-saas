# Focus Tracker

A personal focus and planning app built with Next.js 15, React 18, TypeScript, Tailwind CSS, and Supabase authentication and PostgreSQL.

## Features

- Email/password signup and login, including email confirmation guidance.
- Protected dashboard with focus sessions, running timer, stale-session recovery, daily goals, and seven-day statistics.
- Personal skill checklist with per-skill focus totals.
- Paginated session history and CSV export.
- Monthly calendar with date selection, all-day or timed schedules, optional notes, completion and undo, completion counts, and All / Open / Completed filters.
- Edit schedule details or move a schedule to another date using **Edit or reschedule**.
- English interface, responsive layouts, accessible labels, and pending feedback on schedule saves.

## Local development

Use Node.js 20.19 or newer (production uses Node.js 24) and npm.

```bash
npm ci
cp .env.example .env.local
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for your Supabase project in `.env.local`. Do not commit credentials or use a service role key in the browser. Existing local configuration should be preserved.

Apply the SQL migrations in `supabase/migrations/` using the project's migration workflow; see [migration instructions](supabase/migrations/README.md). Existing deployments upgrading to calendar support need `008_create_schedules.sql` applied once. Editing, rescheduling, and filtering use that same table and need no further migration. Row-level security restricts data to the authenticated owner.

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

Unit tests cover validation, analytics, pagination, session concurrency, authentication actions, schedule creation and edits, and ownership filters. They do not replace live Supabase authentication or database policy verification. The SQL ownership regression check is in `supabase/tests/session_skill_ownership.sql`.

## Dates and time

Dashboard statistics and session history use America/Toronto. Calendar dates and optional times are stored as entered, without UTC conversion; calendar **Today** uses America/Toronto. Schedules without a time display **All day**. Completed schedules remain available and can be reopened.

## Deployment

Push to `main` to trigger the connected Vercel deployment. Configure the Supabase environment variables in Vercel and apply database migrations to the matching Supabase project before using database features. Verify the deployment is Ready and test login, schedule creation, edit/reschedule, completion and undo, and persistence after refresh with a test account.

Dependency versions are locked. Next.js and its ESLint configuration are aligned, with patched PostCSS and source-map-js overrides. Check `npm audit --omit=dev` periodically; an audit result describes known advisories at the time of the check, not a guarantee against all vulnerabilities.

The current full development-dependency audit still reports seven high-severity entries through braces (the registry currently has no patched release). Production dependency audit reports zero known advisories. Avoid processing untrusted glob patterns in development tools, and recheck for upstream fixes. Vitest is updated to 4.1.12.
