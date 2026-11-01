# F2-A02 — Smart Scheduler v1 frozen core contract

Status: **FROZEN for algorithm v1** (2026-11-01); changes require explicit version bump.
Ownership: Algorithm Lead; backend/UI integration is separate and not implied by this PR.
Decision: **Algorithm First, Data Driven, AI Last**. No DB, network, LLM API, or new packages.

## Public entry points

- `scheduleTasks(input, 'optimized' | 'baseline')` in `lib/smart-scheduler/engine.ts`
- `auditSchedule(input, output)` independently recomputes feasibility.
- `estimateDuration(task, defaultMinutes)` and `summarizeTimePreferences(observations)` in `personalization.ts`.
- Types and reason-code enum in `types.ts`.

All times crossing the boundary are **ISO-8601 UTC instants with Z**, at minute precision,
including `nowUtc`, availability, fixed events, deadlines, preferences and prior placements.
Use half-open intervals `[start,end)`; durations mean **actual elapsed minutes**.
A deadline is an *instant*, not a calendar date. Backend must resolve an existing
`schedules.deadline` (date only) to **the start of the following calendar day in the user's
IANA timezone** before calling the engine. For local wall-time conversions, reuse
`lib/wall-time.ts`: nonexistent spring-forward starts are rejected, fall-back folds
select the **later** instant in accordance with existing reminders. The engine does not
reimplement IANA timezone databases.

### Required input

`SchedulerInput`: `nowUtc`, `inputRevision`, `tasks`, `availability`, `fixedBlocks`.
Optional: `previousPlacements`, `preferredWindows`, `policy`.
Tasks have stable `id`, `priority`, optional `estimatedMinutes`, UTC `deadlineUtc`,
`earliestStartUtc`, `deferralCount`, `projectId`, `skillId`, and user-owned
`durationSamples`. Filter completed/deleted tasks by flags.
Backend is responsible for authentication, RLS, read consistency and supplying
**all** immutable events, manually locked time blocks, and active focus intervals in
`fixedBlocks`. An event without a known end must be resolved or explicitly rejected
by the integrator; NEVER silently guess that it occupies zero minutes.
Existing manual task placements must be represented as fixed/locked blocks, not in
`previousPlacements`, which contains only previously accepted *scheduler-managed*
placements. There is no database field indicating this distinction yet.

### Hard constraints

1. Never overlap a fixed event, locked task, active focus interval or another newly
   scheduled task; fixed events can already overlap one another and are not moved.
2. Only place within provided availability, after now and `earliestStartUtc`.
3. Finish by the exact hard deadline instant; expired deadline -> unplaced.
4. Tasks are indivisible in v1; only whole-minute estimates from 1 to 1440 are accepted.
5. A mandatory post-task buffer (`breakMinutes`, default 5) is reserved within the
   availability window and cannot overlap another block. It does **not** extend task
   duration or the hard deadline.
6. An already accepted placement is preserved whenever it still satisfies current
   duration, availability, fixed-event and deadline constraints. When invalidated,
   relocate only the affected managed task; no unrelated accepted blocks are moved.
7. Invalid task IDs/duplicated input IDs, malformed UTC or malformed windows are not
   silently ignored. Per-task invalid estimates and deadlines yield explicit unplaced
   reasons. Invalid top-level input raises `Error`.

### Soft objectives

`priority` weights high/normal/low = 30/15/5; deadline proximity adds
35/25/15/5 points for <=1/2/4/8 days; deferrals add 5 each, capped at 10.
Tasks sort by descending score, ascending deadline, stable ID. The optimized
mode then chooses the feasible slot minimizing elapsed delay from task earliest
start (cost 0.5 per hour), with a bonus of 5 for user-supplied preferred windows.
Preferences NEVER create availability. Baseline: priority-only ordering and first
feasible slot, deliberately without accepted-plan preservation or preference scoring.
Parameters are **initial heuristics, not empirically optimized weights**.

Slot search defaults to 15-minute start alignment; exact durations are not rounded.
Candidate feasibility uses ordered occupied intervals and binary-search collision
checks. Single-task relocation of invalidated accepted blocks is a bounded local
repair; v1 does not evict unrelated accepted tasks or attempt a combinatorial
optimizer. Empty/overfull windows return explicit unplaced records.

### Output / explanations

`SchedulerOutput` includes `algorithmVersion`, unchanged `inputRevision`,
`placements`, `unplaced`, `changes`, `warnings`, and `metrics`.
Placements include exact UTC start/end, estimate provenance and stable Reason Codes.
Some example codes: `PRESERVED_ACCEPTED`, `MOVED_FIXED_CONFLICT`,
`EARLIEST_FEASIBLE`, `HIGH_PRIORITY`, `DEADLINE_SOON`,
`PREFERRED_WINDOW`, `DEFAULT_ESTIMATE`, `PERSONALIZED_ESTIMATE`.
Unplaced codes: `NO_AVAILABILITY`, `NO_CONTIGUOUS_SLOT`,
`HARD_DEADLINE_UNREACHABLE`, `DEADLINE_IN_PAST`, `INVALID_ESTIMATE`.
`hardViolations` comes from `auditSchedule`; it is not hardcoded to zero.

`changes` compare each eligible task with its previous accepted placement.
`movedAcceptedTasks` counts relocated/removed accepted tasks;
`totalShiftMinutes` sums absolute start-time changes for those still scheduled.
`coverageRatio` is the proportion of eligible task **count** placed, not real-world
completion rate.

### Cold start and personalization

- User-authored explicit estimate always wins.
- Missing estimate: 30-minute labeled default unless >=3 valid completed historical
  observations in same skill, project, or all tasks. Use that order for fallback.
- Median is shrunk to 30 with `n/(n+10)`. This is descriptive prediction and
  cannot claim calibrated accuracy or causality; invalid measurements are ignored.
- Hour-level habit statistics require >=20 valid observations across >=5 days and
  >=4 per hour. Output is *exploratory evidence*, never automatically forced
  user preference. Missing hours do not imply that the user cannot work then.
- Integrator should derive samples from completed, attributed focus sessions,
  excluding breaks, abandoned and unattached historical activity. Protect user data;
  no cross-account samples.

### Performance, test and baseline gate

`engine.test.ts`: 40 independent regression tests including DST fold/gap,
overnight, immovable events, conflicts, deadlines, deterministic output, accepted
plan stability and an adversarial audit. `personalization.test.ts`: 12 assertions.
`benchmark.test.ts`: repeated timed 200-task/14-day deterministic fixture;
reports median/p95 milliseconds, constraint violations, coverage and perturbation
movement compared to priority-first baseline. CI numbers must be read from actual
execution logs; this specification does not claim performance without an observed run.
**Do not add CP-SAT/ML unless measured baseline deficiencies justify them.**

### Integration handoff / NOT included

The engine does not read or update Supabase; no new schema, route, RPC, RLS grant,
third-party calendar API, deployment, background scheduler or UI is introduced.
Backend must provide versioned read snapshot, `preview` then **single atomic
conditional batch commit** (re-check ownership, task revisions, fixed conflicts,
availability and policy) and rollback/undo contract. Existing single-task
`mutate_schedule` RPC is NOT a safe atomic batch-commit substitute.
If a task revision changed after preview, return 409 and re-preview; do not overwrite.
Until these responsibilities are implemented, scheduler outputs are proposals only.

Known limitations: no task splitting, dependencies, multi-resource constraints,
multi-agent optimization, recurring-event materialization, automatic energy model,
minute-specific local due dates, or live calendar sync. The caller supplies all
relevant immutable intervals. Past or incomplete accepted plans may be relocated.
Manual events must be locked by an upstream classifier before preview.
