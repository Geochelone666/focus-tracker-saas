# F2-B02 — Smart Calendar backend contract v0.1 (review draft)

**Status:** proposed cross-team contract; `apply_schedule_batch` is implemented in
`20261101000000_calendar_batch_hardening.sql` on a PR branch only.
No new plan-version tables or production migrations are authorized here.
This document records API behavior **before** Algorithm and Frontend leads
approve the persistent plan schema.

## Audit: existing writes

| Entry point | Existing transaction / guard | Decision |
| --- | --- | --- |
| Web task create (`app/planning/actions.ts`, `app/calendar/actions.ts`) | RLS owner and linked project/skill checks; direct inserts | Keep; duplicate POST after timeout can create another task (future idempotency work) |
| Web update, trash, reschedule, future occurrences (`mutate_schedule`) | Invoker RLS; `FOR UPDATE`; exact `updated_at` for all affected occurrences; atomic transaction | Reuse |
| Legacy `edit_schedule` RPC | Invoker RLS, but no `updated_at` comparison; can overwrite newer edits | **Revoke EXECUTE** in this PR |
| Mobile task create/update (`mobile/App.tsx`) | Owner RLS; update has `updated_at` predicate; creation not idempotent | Keep; avoid table-wide UPDATE revocation |
| REST and MCP (`integration_api`) | Scoped expiring bearer, owner check, rate limit, `expected_updated_at` on PATCH | Keep; **create** is not idempotent |
| Web focus `stopSession`, stale recovery and mobile Stop | Older direct mutations mixed with newer lifecycle RPC | Move these clients to `transition_focus` with `focus_revision` |
| Focus `transition_focus` | Invoker, owner, locked row, revision, server-side effective duration | Reuse; keep earlier imported-client pathways compatible for now |
| Focus segment history | Server trigger writes intervals; authenticated readers owner-only | Reuse; never sum pauses/breaks into task actual time |

**Residual:** authenticated direct schedule UPDATE is supported for mobile.
A malicious/obsolete client with a valid JWT can omit its `updated_at`
predicate. PostgreSQL RLS protects owner isolation, **not** intra-owner
optimistic concurrency. Closing this last bypass needs a coordinated,
versioned mobile/API migration; a blind GRANT/REVOKE would break existing
clients. Similarly, there remain legacy direct focus writes by authenticated
PostgREST clients; the new web/mobile paths now favor the guarded RPC.

## Already implementable: atomic schedule batch

`public.apply_schedule_batch(p_changes jsonb) -> integer`, callable only
by authenticated users. Exactly 1–50 entries, each with **exactly**:
```json
{
  "id": "UUID",
  "expected_updated_at": "2026-11-01T15:11:12.123456Z",
  "scheduled_date": "2026-11-02",
  "scheduled_time": "14:30",
  "estimated_minutes": 45
}
```
The caller never supplies `user_id`. Each ID must be distinct and refer
to an open, owned, non-trashed task. Dates/times are *local wall times* in
the current `profiles.timezone` (an IANA identifier). The database computes
real UTC instants, rejects nonexistent DST times, and resolves the repeated
fall-back hour to the later/standard occurrence. Intervals are half-open
`[start_at, end_at)`; meeting exactly at an end is not a collision.
Durations are elapsed minutes rather than wall-clock label differences.

All IDs are locked, every expected version compared, all proposed blocks
checked against one another and against untouched open task blocks; then
`mutate_schedule` is called for every item inside **one** SQL statement.
A failure raises an error and rolls back the entire batch, including the
first updates. Task title, project, skill, notes, priority, completion,
trash state and prior focus history remain unchanged.

Error classes: `42501` unauthenticated/missing/foreign task (avoid user
enumeration), `22023` invalid shape, completion, timezone or DST gap,
`40001` stale version, `23P01` interval overlap. Unexpected invalid
JSON UUID/date casts may return `22P02`/`22007`; normalize at API boundary.
A successful response is the integer number of changed tasks.

**Retry contract:** this version is *at-most-once by optimistic revision*,
not idempotent success replay. After a timeout, fetch each task and compare
the current revision, position and duration. Never blindly resend the same
payload; a repeated stale request receives `40001` and does not duplicate
work. Later plan-confirmation APIs should add a persistent unique
`(user_id, request_id)` receipt.

**Limitations:** this batch writer checks time collisions at commit time
against the snapshot visible to its SQL statement; its advisory lock
serializes **other batch calls by the same owner**. Direct mobile/manual
writes can still intentionally create overlaps and are not covered by that
advisory lock. This is not yet a global no-overlap database constraint,
nor a plan version/undo system. The MVP must surface that distinction.

## Cross-team proposed versioned model (not yet migrated)

Version `smart-calendar/v0.1`:

- `calendar_plan_versions`: `id`, `user_id`, `parent_version_id`,
  `state` (draft/confirmed/undone), `created_at`, `confirmed_at`,
  `input_fingerprint`, `algorithm_version`, `idempotency_key` and
  `confirmed_revision`. Preserve the prior confirmed version.
- `calendar_plan_blocks`: `id`, `version_id`, `user_id`,
  `schedule_id`, `start_at timestamptz`, `end_at timestamptz`,
  `is_locked`, `source` (manual/algorithm), `reason_codes jsonb`,
  `score_components jsonb` and `expected_schedule_updated_at`.
  A block can reference an existing task; source facts remain in
  `schedules`. Locked intervals are hard constraints, never silently moved.
- `calendar_plan_changes` for confirmed versions: immutable before/after
  task-position and revision snapshots; undo is an **inverse compare-and-swap
  transaction**, not a blind overwrite. Undo returns conflict if any
  affected task has changed since confirmation. A draft must not mutate
  live `schedules`.

All new tables require owner RLS, composite owner+referent checks,
bounded JSON, indexed owner/version queries and a transactionally unique
active-confirmed revision. Keep `version_id` distinct from individual
task `updated_at`. Do not add external-calendar tokens to public tables.
Never persist a plan before permission and collision checks.

### Scheduler input

```ts
type SchedulerInputV01 = {
  schema_version: "smart-calendar/v0.1";
  timezone: string;                // validated IANA zone
  window: { start_at: string; end_at: string }; // ISO UTC instants
  base_version_id: string | null;
  tasks: Array<{
    id: string; updated_at: string;
    status: "open" | "completed" | "trashed";
    estimated_minutes: number | null;
    priority: "low" | "normal" | "high";
    deadline: string | null;       // account-local date; inclusive
    scheduled_date: string | null; scheduled_time: string | null;
  }>;
  busy_intervals: Array<{
    start_at: string; end_at: string; locked: true; source_id: string;
  }>;
  actuals: Array<{schedule_id: string; focus_seconds: number}>;
};
type SchedulerOutputV01 = {
  schema_version: "smart-calendar/v0.1";
  base_version_id: string | null;
  placements: Array<{
    schedule_id: string; expected_updated_at: string;
    start_at: string; end_at: string; locked: boolean;
    reason_codes: string[]; score_components: Record<string,number>;
  }>;
  unplaced: Array<{schedule_id: string; reason_code: string}>;
  warnings: Array<{code: string; schedule_id?: string}>;
};
```

Algorithm owns scoring and soft constraints; backend owns authenticated
data retrieval, UTC conversion, hard-constraint verification, version
checks and atomic persistence. The backend must not trust reason codes,
scores or task status supplied by an untrusted browser. It re-reads task
state and all hard constraints before committing.

Actuals are `sum(duration_sec)` for completed
`focus_sessions` with `session_kind='focus'` and matching
`(user_id,schedule_id)`. Exclude abandoned/paused/break records.
Use `focus_daily` when allocating seconds by local day; historical
unrecorded segment residuals are attributed to the original start day,
not reconstructed. Remaining-time calculation cannot assume focus time
equals completion.

### Proposed confirmation and undo

`POST /api/calendar/versions/preview` (pure computation, no writes);
`POST /api/calendar/versions/{id}/confirm` (bearer-auth user session,
full validation, `Idempotency-Key`, atomic apply and receipt);
`POST /api/calendar/versions/{id}/undo` (CAS inverse patch or 409);
`GET /api/calendar/versions/{id}` (owner-only).
No such REST routes exist yet. Algorithm and Frontend leads should approve
task splitting, pinned blocks, draft expiry, and `reason_codes` before
creating these tables/routes.

## Google Calendar sync boundary (future)

Start **read-only** with least-privilege OAuth scope `calendar.readonly`.
Store encrypted refresh tokens in a server-only/private store, not
`schedules`, JWT metadata, `NEXT_PUBLIC_*`, analytics payload or logs.
A private `calendar_connections` record links owner, external calendar
ID, granted scopes, and sync state.

In a separate `external_busy_intervals` snapshot, uniquely identify
events by `(owner,provider,calendar_id,event_id,recurrence_instance_id)`;
store provider `etag`, `updated`, `sync_token`, cancellation status,
source zone and normalized UTC start/end. Repeated sync must upsert on
the unique key, not create duplicate Focus tasks. Expired/deleted events
remove only busy snapshots, never user tasks. For outbound sync in a
later explicitly approved iteration, include an origin marker and stable
mapping ID, compare remote `etag`, ignore echoed updates and stop loops.
One connection must never read/write another owner's calendar.

Handle pagination, incremental sync token invalidation/full re-scan,
out-of-order webhook delivery, recurrence exceptions, time-zone changes,
full-day events, 429 retries, and revoked OAuth grants. Do not request
write scope as part of MVP read-only import.

## Migration and rollback

- Apply only to a **disposable test database** after the previous main
  migrations; compare migration history before deploy. Production is
  expressly out of scope in F2-B02.
- Verify `supabase/tests/calendar_batch_hardening.sql` plus previous SQL
  tests, web/mobile types, and CI. The test uses rollback-only fixtures.
- Rollback after a *separately approved deployment*: stop callers of
  `apply_schedule_batch`, then `DROP FUNCTION public.apply_schedule_batch(jsonb)`
  in a reviewed transaction. **Keep the revoke on `edit_schedule`**
  until all old clients are confirmed obsolete; restoring the privilege
  restores the unversioned overwrite vulnerability. No table/user history
  is deleted by this migration or rollback.
