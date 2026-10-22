# Changelog

## 2026-10-22

- Security (database): new migration `20261022000000_restore_session_schedule_ownership.sql`. Migrations run in file-name order, so `20260930002658` ran after `009` and dropped its check that a session's linked schedule belongs to the user. Apply it to every deployment.
- Day boundaries: "today", the seven-day chart, skill week totals and the weekly review are now correct in time zones where DST skips or repeats midnight (for example Asia/Beirut and America/Havana).
- CSV export: notes beginning with `=`, `+`, `-`, `@` or a tab get an apostrophe prefix, so spreadsheet apps do not run them as formulas.
- Calendar: toggling a schedule now sets and clears `completed_at` together with `is_done`.
- Tests: 205 → 264. `npm test` now applies every migration to PGlite and runs `supabase/tests/*.sql`, and there are new tests for skill actions and for time zones.
