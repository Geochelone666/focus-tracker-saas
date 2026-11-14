# Changelog

## Unreleased — persisted Smart Calendar work hours

- Save work hours across devices with owner-scoped revision checks; preserve stale-device edits and require regeneration after a work-window change.
- Carry canonical preview metadata into drafts and validate saved hours/revisions at staging and confirmation; roll back stale confirmations atomically while preserving successful request replay and undo.
- Requires additive `20261106010000_calendar_work_preferences.sql`; the Smart Calendar flag remains off. See [deployment, legacy behavior and rollback](docs/f2-work-hours.md).
- Add a user-requested [supplemental delivery plan](docs/focus2-next-plan.md) covering remaining safety gates, execution feedback, onboarding, privacy, mobile acceptance, trials and public release.

## Unreleased — experimental execution recovery

- Start task-linked focus from the calendar; review open time blocks and recently focused Inbox tasks in the account timezone.
- Save remaining-time estimates and resume notes with revision checks that preserve stale-device drafts; keep original estimates, task completion and focus accounting separate.
- Add paginated recovery with active-session return, outcome notes and existing rescheduling/task-edit paths; cover cross-midnight and DST boundaries.
- Requires `20261106000000_execution_recovery.sql` and default-off `FOCUS_EXECUTION_RECOVERY_ENABLED`; see [deployment and rollback](docs/f2-execution-recovery.md). Hosted acceptance remains outstanding.

## Unreleased — experimental Smart Calendar integration

- Add original/selected day timelines, mobile view switching, overlap/break feedback and exact-version task lock controls. Preserve unsaved edits when a changed work window requires regeneration.
- Requires `20261104010000_calendar_lock_controls.sql` after the preview snapshot migration. The experimental flag remains disabled by default.

- Add a bounded owner snapshot and a feature-gated real preview, selective/manual edits, versioned confirmation, refresh recovery and CAS undo.
- Keep manual and locked blocks fixed; reject active focus, stale task revisions and changed timezones.
- Add snapshot/staging migration `20261104000000_calendar_preview_snapshot.sql` and SQL, action and 390px browser workflow coverage.
- `FOCUS_SMART_CALENDAR_ENABLED` defaults off; hosted migration drift and independent contract/design acceptance remain release gates.

## Unreleased — Focus V1 batch 1

- Add persistent count-up/countdown timing, pause/resume, revision-checked atomic focus transitions and retained zero-credit abandonment.
- Share focus controls on Today and Dashboard, with outcome notes, silent countdown completion and refresh recovery.
- Preserve completed history and owner/AI boundaries in additive migration `20261025000000_focus_state.sql`; deploy it before application changes.
- Add focus SQL, unit/action and authenticated fixture-backed browser regressions, plus the V1 audit/delivery queue and rollback instructions.
- Subsequent batches add break cycles and fixture-verified capture-to-review coverage (see below); hosted production verification remains outstanding.

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
