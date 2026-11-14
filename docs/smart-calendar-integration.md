# Smart Calendar MVP: integration contract and release gates

Status: **design proposal only** for F2-I02, not a migrated feature, release authorization, or replacement for the Algorithm/Backend/Frontend leads' final contract.

## Keep the existing stack

- **Next.js 15 / Vercel:** server-rendered `app/calendar/page.tsx`, existing `components/time-block-calendar.tsx`, authenticated Server Actions, in-app proposal preview.
- **Pure TypeScript scheduler:** new `lib/scheduler/` with deterministic, side-effect-free `proposeSchedule(input)`. Reuse `lib/time-blocks.ts` and `lib/wall-time.ts` to resolve IANA user zones, DST gaps/folds, actual elapsed minutes, overnight intervals and existing occupied blocks. No AI API, remote scheduler, queue, Redis or worker.
- **Supabase PostgreSQL:** `schedules` remains the canonical task/block table; `profiles.timezone` governs wall time; `focus_sessions` and `analytics_report` provide historical estimation signal. Keep RLS, authenticated ownership and `mutate_schedule` for manual edits.
- **Optional Expo native:** existing native client opens the web calendar; no parallel native scheduler in MVP. The PWA remains first-class.

The current day/week/month calendar, Inbox, task priority, deadline, estimate, recurrence, optimistic per-task edits, conflict display, planned-vs-actual analytics and mobile/keyboard editor already exist. Reimplement none of them.

## Bounded MVP contract

The user explicitly requests a preview for a 7–14-day window. Only open, non-trashed tasks are candidates. Treat existing manually arranged blocks as **locked** by default, preserve their times, and never change completion, skill, project, deadline or series metadata just to fit a proposal.

Input (server-validated, owner scoped):
- `timezone` (validated IANA), inclusive day range, allowed work windows, breaks and minimum block size.
- Candidate `schedules` fields: `id`, `scheduled_date`, `scheduled_time`, `estimated_minutes`, `priority`, `deadline`, `is_done`, `deleted_at`, `series_id`, exact microsecond `updated_at`.
- Current occupied blocks and optionally aggregated historical duration statistics, retrieved with **bounded owner-filtered queries**. Do not load all historical focus rows or every task to render a week.
- Never trust a client-supplied `user_id` or assume missing actual measurements equal zero. Default a missing estimate to an explicitly labelled provisional 30 minutes.

Output: `{ timezone, requestedRange, assignments: [{ scheduleId, scheduledDate, scheduledTime, estimatedMinutes, expectedUpdatedAt, reasons }], unassigned: [{ scheduleId, reason }], warnings }`. Stable ordering and explicit reasons must make identical inputs produce identical output. No implicit writes.

Hard constraints: user-selected work window, time validity and DST, no overlap among suggested blocks, preservation of locked blocks, deadline cutoff, completed/trashed exclusion. Soft constraints: priority, urgency, preferred time and estimated energy/availability. Existing **manual** overlaps remain legal, but newly suggested blocks must be non-overlapping. If infeasible, leave work unassigned rather than violate a hard constraint. Avoid speculative precision for cold-start preferences.

## Write boundary: atomic batch is required before release

A preview is not a write authorization. The user accepts/edits/rejects suggestions and submits only the selected subset via a new authenticated Server Action. **Do not** call `mutate_schedule` once per task in a loop: partial writes and cross-device conflicts could corrupt the proposed batch.

Propose one narrow PostgreSQL `SECURITY INVOKER` RPC (e.g. `apply_schedule_proposal`) that:
1. Authenticates the current caller and checks row `user_id = auth.uid()` under RLS; no service-role bypass.
2. Validates a bounded array of task IDs and permitted changes, rejecting duplicate IDs and unapproved fields.
3. Locks affected rows in stable ID order, checks each complete `updated_at` against expected revisions, excludes completed/deleted rows and respects recurrence semantics.
4. Rechecks all submitted times in the owner's IANA timezone, hard constraints and inter-proposal conflicts. Prevent a time-of-check/time-of-use gap by validating against the locked authoritative snapshot; define isolation for concurrently edited occupied blocks.
5. Updates all accepted tasks in **one transaction**, or aborts all on any error. Return updated IDs/new revisions and meaningful conflict categories, never raw SQL errors.

Preserve existing `mutate_schedule` for one-off user edits. Add only an additive migration after #55 drift reconciliation and documented schema/permission acceptance. Include RLS and concurrency SQL tests. For one-click reversible apply, use a minimal owner-scoped batch/snapshot record with old values and expected post-write revisions; undo is another revision-checked atomic transaction. Do **not** introduce a broad plan-versioning platform without proven need.

## UI and API responsibilities

- `app/calendar/page.tsx`: render an explicit **Suggest schedule** entry and current day/week calendar. Load the visible date range and paginated Inbox; preserve accessible keyboard/touch manual editing.
- `app/calendar/*-actions.ts`: authenticate with existing Supabase SSR `getUser()`, validate request bounds, call pure scheduler for preview, then the owner-scoped atomic RPC for apply. Do not call an AI model or add a public unauthenticated scheduling API.
- `components/time-block-calendar.tsx`: preview as separate visually identifiable ghost blocks, show unassigned reasons and a readable diff before confirm. Save/undo feedback must preserve a user's draft, allow cancellation and show stale-revision conflicts.
- `lib/scheduler/`: pure rules, tests and benchmarks; no imports from Next.js, Supabase clients, fetch or timers. Parameterize current time.

## Test and delivery contract

1. Determinism, no suggested overlaps, deadline/work-window violations, stable tie-breakers, unassigned reasons, overnight/DST gap/fold, 23/25-hour days and inclusive boundaries.
2. PGlite/SQL: ownership, RLS, all-or-nothing batch, duplicate IDs, stale revisions, concurrent locked block changes, repeated requests, undo after external changes and return-value versions.
3. Next.js integration: Inbox capture -> preview -> accept subset -> persist -> reload -> manual adjustment -> undo; 390px and keyboard flows, accessible conflict feedback.
4. Load test fixed fixtures for 100 tasks / 7 days (provisional target: scheduler compute under 200 ms in a declared CI environment; baseline not yet measured).
5. Pre-release: exact CI green commit, migration drift #55 reconciled, real Supabase/GoTrue/PostgREST test-account authorization, Vercel READY matching SHA, app smoke checks and a reviewed compatible rollback.

## Architecture and delivery risks (F2-I02)

1. **P0 release race:** on 2026-10-31 the matching Vercel production build was READY before the full GitHub E2E job succeeded. Protect `main` with PR review and required checks (`ci`, `e2e`, `mobile`), prohibit force push/deletion, include admins where possible, no automatic merge. Inspect and enable a Vercel deployment approval/check mechanism **only with separate authorization**; branch protection by itself does not prevent production promotion preceding post-push CI.
2. **P0 #55 migration registry mismatch:** CI's local-only preflight cannot validate a live inventory; follow `docs/migration-drift-preflight.md` and keep production `db push` blocked until complete reconciliation.
3. **P1 scale:** `lib/planning-data.ts` currently reads all schedules for calendar and other views; scope Smart Calendar loads to the relevant dates and paginate undated tasks. Avoid a full-table fetch per preview.
4. **P1 runtime/dependency compatibility:** web CI is aligned to Vercel Node 24 by this PR; mobile stays on Node 22 with existing Expo SDK 54 lock/version check, independent of the Next.js runtime. Root CI `npm ci`, `npm ls --depth=0`, TypeScript, build and E2E complement rather than duplicate checks.
5. **Historical docs:** `docs/ai-connections.md` still says web edits are last-save-wins and only six tools; `docs/validation-v1.md` and parts of `supabase/migrations/README.md` describe now-applied V1 migrations as unreleased. Treat historical receipts as dated evidence, not current deployment truth. Prefer focused corrections to the existing docs over creating parallel operating manuals.

## Pre-release and rollback checklist

Before any future authorized release:
- [ ] Identify intended GitHub commit, reviewed PR and required green jobs; verify dependent web/mobile versions.
- [ ] Confirm intended Vercel project, branch, target, environment variables **by names/scopes**, and production release gate. Never print values or secrets.
- [ ] Acquire a fresh, complete and sanitized remote migration inventory; run offline comparison; resolve #55 with independently verified SQL effects and separately approved migration strategy.
- [ ] Rehearse additive migrations and recovery on a disposable Supabase project; verify RLS, grants and compatibility with previous app version.
- [ ] Smoke-test test-account login, owner isolation, task capture, scheduling, editing, background focus, timed reminders and persistence after refresh.
- [ ] Verify prospective build and production commit/alias match before declaring delivered; monitor provider/runtime errors without exposing user data.
- [ ] Rollback plan: disable new UI/algorithm writes, promote the previously validated **compatible** Vercel build under approval, retain additive data, and investigate database changes separately. Do not reverse production SQL without a reviewed migration/backup and test.

**F2-I02 only creates a PR and runs tests. It does not change production, protection rules, or deploy.**
