# F2-A03 — Focus Smart Calendar v0.1 integration contract

**Status:** Algorithm Lead implementation contract; backend confirmation is tracked in
[Issue #74](https://github.com/Geochelone666/focus-tracker-saas/issues/74).
This document is the **only proposed cross-boundary v0.1 envelope**. The F2-A02
`SchedulerInput`/`SchedulerOutput` remain private engine-internal types, **not a
second backend REST/RPC contract**.

**Scope:** pure transforms, no Supabase/REST writes, no migration, no AI API. New
F2-A03 PR is stacked on [PR #73](https://github.com/Geochelone666/focus-tracker-saas/pull/73).
QA oracle imported **byte-identically** from [QA PR #72](https://github.com/Geochelone666/focus-tracker-saas/pull/72).
Backend's PR #69 stays untouched; do not infer its batch writer has all v0.1 guards.

## Server-owned canonical snapshot

TypeScript source of truth: `SmartCalendarSnapshotV01` in
`lib/smart-scheduler/focus-adapter.ts`. JSON field naming is **snake_case**;
engine internally uses camelCase. Version string: `smart-calendar/v0.1`.

| Snapshot property | Type / source | Required semantics |
| --- | --- | --- |
| `schema_version` | literal `smart-calendar/v0.1` | Reject unknown versions |
| `user_id` | authenticated backend identity | No user-supplied/browser owner |
| `timezone` | `profiles.timezone` IANA string | Reject invalid, no fallback during commit |
| `captured_at` | authoritative server instant | Explicit UTC/offset; hashed in fingerprint |
| `window` | `{start_at,end_at}` UTC instants | Bounded preview horizon |
| `base_version_id` | UUID or null | Parent accepted plan; accepted rows must match |
| `schedules[]` | owned `schedules` projections | Exact microsecond `updated_at`; task status/priority/estimate/date/time/deadline/deferral/project/skill |
| `availability[]` | owner-tagged `{start_at,end_at}` | **Explicit** working windows; clipped to horizon; empty means no availability |
| `busy_intervals[]` | owner-tagged `source_id,kind,start_at,end_at` | `kind=external\|locked\|active_focus`; unknown end must FAIL CLOSED |
| `accepted_blocks[]` | owner-tagged accepted plan snapshot | `schedule_id,version_id,expected_updated_at,start_at,end_at,is_locked` |
| `focus_sessions[]` | completed user-owned `focus_sessions` projections | `session_kind,focus_status,duration_sec,ended_at,schedule_id` |
| `preferred_windows[]` | optional owner-tagged UTC intervals | Soft preference only, never availability |
| `policy` | optional deterministic engine settings | Explicit slot/break/default estimate |

**Hard trust boundary:** `adaptFocusSnapshot` rejects any foreign-owned schedule,
availability, busy event, accepted block or session even when that row would not be
scheduled. This check is defense in depth, **not** a replacement for database RLS.
Backend must obtain a consistent authenticated snapshot and impose bounded read
limits. The `input_fingerprint=sha256:...` changes when relevant tasks/revisions,
fixed blocks, availability, preferences, time or plan version change. It is a
change detector, **not** cryptographic authentication and **not** a transactional
compare-and-swap substitute.

## Interpret real Focus rows

- `is_done=true` or `deleted_at!=null`: not schedulable.
- Manual task with both `scheduled_date` and `scheduled_time` but **without** an
  accepted scheduler-owned record: immutable fixed interval. Missing explicit
  `estimated_minutes` => `UNBOUNDED_FIXED_EVENT` hard refusal (no fake meeting length).
- Manual date-only task: eligible **only on that account-local date**; earliest is
  local midnight, latest finish is next local midnight. An unrelated task's
  `scheduled_date` is NOT automatically interpreted as its deadline.
- Inbox task: eligible throughout explicit available windows.
- Accepted scheduler task: preserve its interval if feasible, else move only
  affected task; `is_locked=true` goes to fixed blockers and is not a candidate.
- Stale or cross-version accepted blocks: reject instead of quietly overriding.
- Active focus/third-party event: requires authoritative, bounded busy interval.
  Do not manufacture `end_at` from unknown elapsed-timer duration.
- Historical durations: one example per completed task, sum **completed focus**
  sessions with the same `schedule_id`; skip breaks, abandoned, invalid, future,
  unattached, implausible or zero totals; no cross-user samples; at most 200
  chronological samples. `estimated_minutes` explicitly entered by the user wins.

## Time, DST and persistence boundary

Every wire `start_at/end_at` is a UTC instant (ISO 8601), with half-open
interval `[start,end)`. Task length is elapsed minutes, not wall-label delta.

- Account-local date-only `deadline` is **inclusive**: translate to
  `start_of_local_day(deadline + 1)` as the *exclusive* UTC hard boundary.
- Resolve manual wall times with existing `lib/wall-time.ts`:
  spring-forward gaps fail; fall-back repeated times take the **later** standard
  instant. `lib/analytics.ts:getMidnightInTimeZone` handles 23/25-hour days.
- Backend PR #69 `apply_schedule_batch` accepts local `scheduled_date/time`,
  not UTC `start_at`. **Before calling it**, backend must round-trip the proposed
  UTC start through the user's IANA zone and verify it resolves to the same
  instant using the **later-fold rule**; otherwise reject and re-preview. Engine
  results in the *earlier* occurrence of a repeated wall-time hour are not
  expressible with that RPC (known rare integration boundary). Never silently
  save at a different instant.
- On confirmation, the backend MUST re-read the authoritative state under
  appropriate locks, authenticate owner, validate all affected *and unselected*
  blocks, deadlines, working windows, task revisions, locked/fixed events and
  persisted plan version. Unknown/missing event end => reject.
- PR #69's existing batch RPC limits requests to **1–50 tasks** and does not
  provide CAS undo or complete lock/window/deadline validation; a larger preview
  is NOT an authorization to split an accepted plan into non-atomic batches.
  Keep commit blocked until backend v0.1 confirmation protocol is approved.
- Explicit `Idempotency-Key` receipts and versioned inverse CAS undo belong to
  backend F2-B03, not the pure engine or this adapter. A draft does not write.

## Canonical wire output

`SmartCalendarOutputV01` from `previewSmartCalendar`:
`schema_version`, `algorithm_version`, `base_version_id`, `input_fingerprint`,
`placements[]`, `unplaced[]`, `warnings[]`, `changes[]`, and `metrics`.

Each placement: `schedule_id,expected_updated_at,start_at,end_at,locked:false,
reason_codes[],estimate_source`. Each unplaced task:
`schedule_id,reason_code`. Reasons are the F2-A02 `ReasonCode` literal union
(`PRESERVED_ACCEPTED`, `HIGH_PRIORITY`, `DEADLINE_SOON`, `DEFAULT_ESTIMATE`,
`MOVED_FIXED_CONFLICT`, `NO_AVAILABILITY`, `NO_CONTIGUOUS_SLOT`, etc.).
There is **no** generated score-components object that fabricates optimizer weights;
backend v0.1 *proposal* should treat scoring components as future optional metadata.
Backend may serialize `changes` for its undo receipt **only after** transactional
validation and confirmation. Do not persist preview as confirmed state.

## Independent QA integration

The file `qa/scheduler-acceptance.ts` is copied unchanged from PR #72 at
`98b8223f57b825416cbf6799ac223fc777243273` (same Git blob).
`qa-bridge.ts` translates **actual** `scheduleTasks` results into QA's
epoch-millisecond `QAInput` and `QAProposal`. QA independently checks one
result per eligible task, duration, deadlines, early starts, windows, locks,
overlaps and explanation codes; it does not merely repeat `auditSchedule`.
A separate original engine audit verifies mandatory post-task buffers (which
the QA oracle does not model). When PR #72 merges, the original QA oracle
should take precedence; do not maintain divergent copies.

Fixture: `docs/fixtures/smart-calendar-v01-sample.json` has synthetic Focus
rows and exact expected placements. Runnable assertion:
`npm test -- lib/smart-scheduler/focus-adapter.test.ts`.
No production data, secrets or tokens appear in the fixture.

## Calibration and benchmark

`evaluateDurationEstimates` uses strictly past-only completed-task history,
groups equal timestamps to avoid same-time leakage, and reports MAE,
median absolute error, signed bias and a naive prior baseline. Synthetic
fixtures prove calculations and isolation; **no real user accuracy metric**
is claimed until privacy-compliant historical evaluation is approved.

`scale-benchmark.test.ts` exercises the real engine with 100/500/1000 tasks,
14 days of availability, daily fixed events, priority mix, and accepted-plan
perturbations; outputs p50/p95 wall-clock runtime, sampled heap/RSS memory,
coverage, hard-constraint count, independent QA issues and movement against
the simple baseline. These are synthetic Node CI runner measurements;
memory deltas are **not peak memory** and results are not real-user throughput.

## Known limitations / integration release gates

1. PR #69 does not resolve the unselected-row concurrent-change TOCTOU window,
   accepted-plan undo, idempotency receipts, persistent locks and verified
   working-window enforcement. These are **backend P0 blockers**, not solved
   by an algorithm adapter.
2. A manually timed task lacking duration blocks conservative preview until
   the user supplies or approves an explicit duration.
3. No task splitting, precedence graph, cross-account access or remote
   calendar fetch. Accepted scheduler blocks alone are movable.
4. No automatic prediction of actual completion from focus minutes; predictions
   are duration estimates with uncertainty, not causal effects.
5. Performance tests exercise pure computation; authenticated network reads,
   storage transactions, and multi-user hosted Supabase are not measured.
6. V0.1 external `score_components` should be optional or removed until a
   real, synchronized engine breakdown exists. Never invent provenance.
7. Frozen F2-A02 engine remains unchanged in this integration PR; improvements
   require distinct evidence and review.
