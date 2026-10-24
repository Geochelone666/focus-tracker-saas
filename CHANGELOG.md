# Changelog

## Unreleased — Focus V1 batch 1

- Add persistent count-up/countdown timing, pause/resume, revision-checked atomic focus transitions and retained zero-credit abandonment.
- Share focus controls on Today and Dashboard, with outcome notes, silent countdown completion and refresh recovery.
- Preserve completed history and owner/AI boundaries in additive migration `20261025000000_focus_state.sql`; deploy it before application changes.
- Add focus SQL, unit/action and authenticated fixture-backed browser regressions, plus the V1 audit/delivery queue and rollback instructions.
- Break cycles and the complete capture-to-review flow remain outstanding; no production verification is claimed.

## Unreleased — phone notifications

- Installable web app with iPhone/Android installation guidance, opt-in web push, per-device advance reminders, tests and remote disconnection. No developer accounts required for this path.
- Server reminders with private lock-screen text, owner checks, leases, retries, expired-subscription cleanup, timezone/DST rules and tap-to-plan login navigation. Requires the new migration, server configuration and minute scheduler.
- Optional Expo native source and iOS/Android bundle checks; signed packages and store delivery require separate credentials and physical-device validation.

## 2026-10-22

- Security (database): new migration `20261022000000_restore_session_schedule_ownership.sql`. Migrations run in file-name order, so `20260930002658` ran after `009` and dropped its check that a session's linked schedule belongs to the user. Apply it to every deployment.
- Day boundaries: "today", the seven-day chart, skill week totals and the weekly review are now correct in time zones where DST skips or repeats midnight (for example Asia/Beirut and America/Havana).
- CSV export: notes beginning with `=`, `+`, `-`, `@` or a tab get an apostrophe prefix, so spreadsheet apps do not run them as formulas.
- Calendar: toggling a schedule now sets and clears `completed_at` together with `is_done`.
- Login and signup: when Supabase can't be reached, the page now says "Couldn't reach the sign-in service…" instead of the raw "fetch failed".
- Browser end-to-end check of the auth guard (`npm run test:e2e`), run in CI without secrets.
- Tests: 205 → 266. `npm test` now applies every migration to PGlite and runs `supabase/tests/*.sql`, and there are new tests for skill actions and for time zones.

### Focus V1 batch 2

- Separate short/long breaks and bounded configurable focus cycles, with duplicate-safe next phases.
- Add optional project/task links, explicit sound/notification opt-in and effective-time history/CSV.
- Requires additive migration `20261025010000_focus_cycles.sql`; live Supabase remains unverified.

### Focus V1 batch 3

- Add day/week time blocking, drag/drop, resize, overlap warnings and mobile/keyboard scheduling.
- Separate task deadlines from execution times and add exact-revision web saves, including future unfinished recurring tasks.
- Validate DST gaps and display repeated/overnight blocks using account timezone semantics.
- Requires `20261025020000_time_blocks.sql`; preserve user data and additive fields on rollback.

### Focus V1 batch 4

- Record effective intervals and aggregate completed focus/break time at account-local day boundaries, including DST and cross-month sessions.
- Add 7/30/custom planned-versus-actual review, task differences, completion trends, estimate fit, deferral/overdue indicators and separate project/skill identities.
- Replace raw history downloads with database aggregates; paginate report tasks; extend CSV with break/phase/link fields.
- Preserve unsaved task drafts and revision snapshots during revalidation; add a workspace loading state.
- Requires `20261025030000_planned_actual.sql`; historical missing interval/completion data remains explicitly unknown.
- Requires `20261025020000_time_blocks.sql`; preserve user data and additive fields on rollback.
- Requires additive migration `20261025010000_focus_cycles.sql`; live Supabase remains unverified.
