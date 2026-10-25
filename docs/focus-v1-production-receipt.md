# Focus V1 hosted production upgrade receipt — 2026-10-25

This receipt records **live Supabase** acceptance in addition to the local/CI validation in [validation-v1.md](validation-v1.md). It does not substitute for an actual human login, two-device user journey, or physical focus-alert verification.

## Code and upgrade context

- Vercel production alias `focus-tracker-saas.vercel.app` resolved to a READY deployment of `main` commit `7e33a9e` at inspection.
- That build contained Focus V1 batches 1–4, but the production database initially **lacked** `focus_status`, `deadline`, `analytics_report`, etc.
- Applied the four committed migrations in dependency order to the existing production Supabase project:
  1. `20261025000000_focus_state.sql`
  2. `20261025010000_focus_cycles.sql`
  3. `20261025020000_time_blocks.sql`
  4. `20261025030000_planned_actual.sql`
- Hosted Supabase migration records were written under unique server-generated version IDs/names (not their original Git filenames); confirm schema and function state rather than relying on matching names alone.

## Hosted acceptance performed

- Existing data remained intact: **5** historic focus sessions (all completed; **2,979** total focus seconds), **2** schedules; no open sessions at the time of upgrade.
- Columns, privileges, function definitions, owner policies and all three focus/schedule triggers inspected after rollout.
- Authenticated Supabase SQL check, executed inside **BEGIN / ROLLBACK**: create a synthetic countdown session, pause, resume, complete, confirm exactly two recorded closed intervals, and enter a short-break phase. **PASS.** All synthetic rows were rolled back.
- Authenticated Supabase SQL check, executed inside **BEGIN / ROLLBACK**: reschedule a task, ensure one deferral increment, and reject a stale revision. **PASS.** The task change was rolled back.
- Authenticated analytics check on an account with existing history: JSON object returned six daily rows, two task rows, one project row, one skill row, and four clearly flagged legacy sessions with incomplete interval history. **PASS.** This preserves uncertainty instead of constructing fictitious focus intervals.
- Push cron remained active at `* * * * *`; last inspected dispatcher calls returned HTTP 200. A previous **2026-10-24 12:20 America/Toronto** real automatic reminder had one accepted send with no logged error and phone receipt acknowledged by the user. The Focus V1 database upgrade did not change the push scheduler.

## Follow-up and limitations

- CI/build and database acceptance are different from a complete hosted browser workflow. Real Supabase email-login, all web views, multi-device concurrency, mobile focus sounds and push alerts require additional hands-on verification.
- Vercel full runtime logs returned HTTP 403 from the current connector team scope during this audit. A READY deployment and healthy Supabase cron responses do **not** prove the absence of runtime errors.
- Supabase advisors flagged a duplicate `(user_id,scheduled_date)` btree introduced by the V1 analytics migration: `schedules_owner_date` duplicates the pre-existing `schedules_user_date_idx`. The follow-up migration `20261025040000_remove_duplicate_schedule_index.sql` removes only the duplicate after testing. Other RLS performance and optional auth-password advisor notices require targeted review; do not blindly relax owner isolation.
- Do **not** run test fixtures from `supabase/tests/` against production. Hosted checks in this receipt used explicit rollbacks. No notifications were sent as part of the Focus V1 migration validation.
