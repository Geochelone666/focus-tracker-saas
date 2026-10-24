# Focus Track V1 audit and delivery queue

Baseline: `main` at `2666988` (fetched before implementation). Reviewed README, planning and AI documentation, all migrations, application actions/components, test suites, and recent commits (ownership restore, DST boundaries, project identity, authentication E2E, AI integration).

GitHub public pages inspected: open issue [#1, MVP v1](https://github.com/Geochelone666/focus-tracker-saas/issues/1) describes the original auth/session/weekly/skills MVP, largely superseded by current code. The open PR list showed **0** entries at inspection. GitHub API calls returned proxy `403 Forbidden`; public HTML was used for this read-only audit. These observations are not a claim of authenticated API/write access.

“Verified” below means existing automated local tests or the checks documented for this branch, never production verification. No live Supabase credentials or production deployment were available.

| Capability at baseline | Classification | Evidence / gap |
| --- | --- | --- |
| Capture / Inbox, estimates, priority, projects, skills | Implemented with verification | `parsePlan`, planning action tests and SQL regressions; hosted persistence unverified |
| Task → focus association | Implemented with verification | `schedule_id`, owner policies and action tests; project derived through current task, no historical project snapshot |
| Count-up timer, reload restoration | Partial | Timestamp rendering exists; no persisted pause state or countdown |
| Pause / resume / countdown | Not implemented | Stop subtracts original start from now; stale resume rewrites original timestamp |
| Discard and stale recovery | Defective for V1 | Legacy discard deletes an active row, resume resets its start; replace with preserved abandoned/paused state |
| Single active session | Implemented with verification | Partial unique index on `user_id WHERE ended_at IS NULL`; SQL and mocked concurrency tests; two real devices unverified |
| Notes / skills on completion | Implemented with verification | Validation/action tests; preserve first successful concurrent stop |
| Breaks, cycles, configurable sound | Not implemented | No break domain state; notifications belong to task reminders, not focus |
| Month calendar and bounded repeat occurrences | Implemented with verification | `scheduled_date`, `scheduled_time`, `series_id`, edit-one/future RPC and SQL tests |
| Day/week timeline, drag/drop, resizing, conflicts | Not implemented | Month grid plus form editing only |
| Deadline separate from scheduled time | Not implemented | Project target date exists; a task deadline does not |
| Account timezone and DST reminders/day boundaries | Implemented with verification | IANA profile zone; DST jump/repeat tests; calendar stores wall dates/times |
| Task actuals, daily planned work, seven-day trends | Partial | Today sums linked sessions, dashboard/week review; no date-range comparison or accuracy metric |
| Historical attribution / scale | Partial | Sessions attributed wholly to their start date; Today loads all session history, planning loads all tasks in pages; project attribution changes if task project changes |
| Migration order / owner RLS | Implemented with verification | PGlite applies filename order and all SQL scripts; restore migration repairs policy overwritten by later-sorting legacy migration; hosted migration state unverified |
| Web editing concurrency | Defective | Web forms lack expected revisions and can silently overwrite; AI edit RPC already requires exact `updated_at` |
| AI API / MCP boundary | Implemented with verification | Scoped keys, hashed storage, expiry/revoke/rate limits, owner resolution, explicit field whitelist, audit; no focus lifecycle endpoint. Real third-party clients unverified |
| Mobile / accessibility / E2E | Partial | Semantic forms and auth-guard 390px checks; no complete authenticated capture → review workflow |
| Live auth, production RLS and persistence | Implemented but not actually verified | Requires matching Supabase project/migrations/test accounts and deployed application |

## Ordered work (one independent branch and PR per batch)

1. **P0 / batch 1 — focus consistency, pause/resume, countdown** (`feat/focus-state-v1`): persisted state and millisecond accumulator, authoritative DB clock, immutable start, row-locked revision checks, existing single-active index, repeat-safe completion, count-up/countdown controls on Dashboard/Today, retained abandoned records. Verify migrated SQL/RLS, unit/actions, authenticated fixture-backed Chromium, and all existing checks. This branch implements this batch; breaks are not included.
2. **P0 / batch 2 — full Focus Mode and breaks**: short/long break settings, cycle targets, explicit focus/break transitions, separately recorded durations, standalone task/project/skill selection, task outcome presentation, opt-in sound/notifications. Demonstrate 25-minute focus + 5-minute break with reload/background tests. Reuse batch 1, never credit breaks to `duration_sec`.
3. **P0 / batch 3 — time blocking**: day/week 24-hour grid reusing schedule date/time/estimate, Inbox scheduling and return, pointer and keyboard/mobile editing, soft overlap warnings, separate deadline only after schema review. Extend edit-one/future rules with revision conflict handling and explicit DST ambiguous/nonexistent-time policy. Rollback-safe migration and reloaded drag/resize browser tests required.
4. **P1 / batch 4 — planned versus actual**: task deltas and project/skill identity totals, 7/30/custom ranges, completion/deferral trends and truthful empty states, consistent cross-day allocation and DST tests, bounded queries/aggregation, compatible CSV expansion. Do not treat unfinished/missing actuals as measured zero.
5. **P0 / across batches**: web task optimistic concurrency, RLS/AI regression checks, migration/rollback rehearsal, loading/error/retry and 390px accessible flows. Preserve existing data; no automatic merge or production mutation.

## Batch 1 boundaries

The app can now exercise start → pause → reload → resume → finish/abandon, including countdown capping and stale-device conflict feedback. Idle focus controls refresh every 15 seconds and on focus/network return while preserving an edited note. This is eventual synchronization; DB serialization and constraints provide write correctness. An expired countdown is capped in the DB even after background suspension, and saved when a client returns; there is no background scheduler. Focus UI is silent.

Remaining V1 acceptance items are deliberately open: actual break cycles; live hosted two-device checks; day/week calendar; planned/actual ranges; complete capture-to-review E2E. Local fixtures do not establish production readiness. See [focus state deployment and validation](focus-state.md).

Batch 2 implementation (`feat/focus-cycles-v1`, stacked on batch 1): configurable bounded cycles and separate short/long break accounting, explicit next-phase startup, optional task/project/skill selection, user-gesture sound and permission-based notifications. Corrects history/CSV wall-clock overcounting. Local SQL/browser checks are required before commit; production checks remain open.

Batch 3 implementation (`feat/time-blocking-v1`, stacked on batch 2): day/week time blocking, mobile/keyboard editor, drag/move/resize, deadline separation, non-blocking overlap warnings, exact root/future occurrence revisions on web mutations, DST-gap validation and overnight blocks. Hosted checks and publication remain open.

Batch 4 implementation (`feat/planned-actual-v1`, stacked on batch 3): effective interval ledger, database daily/task/project/skill aggregates, 7/30/custom review with paginated task rows, daily plan/focus/break totals, task variance, estimate fit and completion/deferral/deadline metrics. Legacy gaps are explicit. All four batches are locally implemented; production acceptance, actual PR creation and publication remain external blockers rather than verified outcomes.
Batch 3 implementation (`feat/time-blocking-v1`, stacked on batch 2): day/week time blocking, mobile/keyboard editor, drag/move/resize, deadline separation, non-blocking overlap warnings, exact root/future occurrence revisions on web mutations, DST-gap validation and overnight blocks. After merging current main, fold resolution follows the existing reminder contract (later/standard occurrence). Hosted checks and publication remain open.
Integration update: merged latest main `5a14a30`, including phone notification support and restricted auth trigger access. Unreleased Focus migration versions moved to `20261025...` to avoid collisions with the new main push/security migrations. Authenticated GitHub API access is now available; open items include #38 (optional native tooling advisories) and six Dependabot PRs (#41–46), which are not merged or modified by this feature. Native release/advisory acceptance remains outside the web workflow.
