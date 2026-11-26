# F2-B03 — Calendar atomic commit / review contract

Status: DRAFT, PR #78 stacked on draft PR #69. Production deployment, migration and merge are NOT authorized.
Algorithm input: Issue #74 and PR #73 frozen smart-scheduler contract.

## Existing RPC retained

Existing public.mutate_schedule remains the revision-checked task editor.
Existing public.apply_schedule_batch(jsonb) remains the atomic batch writer.
F2-B03 extends its lock set to all existing open owner rows, including
untouched blocks, and locks the account timezone before final collision and
deadline checks. A new trigger gates relevant direct schedule INSERT/UPDATE,
focus starts/transitions and manual task lock changes under the same
owner-scoped transaction advisory lock. This prevents in-flight phantoms.
It does not prevent old clients intentionally making overlaps AFTER commit.

## Minimal tables and security

- calendar_plan_state: one revision per owner (owner RLS; direct writes denied).
- calendar_plan_drafts: immutable versioned 60-minute candidate, UTC availability
  and IANA timezone (owner RLS; direct writes denied).
- calendar_plan_receipts: request UUID uniqueness per owner, previous/after task
  snapshots, confirmed revision, one CAS undo (owner RLS; direct writes denied).
- calendar_task_locks: user-owned pinned schedule references; owner-only RLS
  for select, insert and delete.

Definer RPCs are used solely because the ledger is not directly writable.
Each validates auth.uid(), strictly scopes every state change to that owner,
sets an empty search path and revokes anonymous execution. Earlier broad
default table privileges are explicitly revoked on new ledger tables.

## API contract

stage_calendar_draft(p_changes jsonb,p_availability jsonb,p_base_revision bigint) -> uuid

Changes: 1–50 distinct task IDs, each exactly
{id,expected_updated_at,start_at,end_at}. Times are UTC ISO strings
YYYY-MM-DDTHH:MM:00Z at minute precision. Intervals are half-open.
Duration is 1–1440 elapsed minutes. Availability is 1–100 UTC intervals.
This is a stored owner-authored snapshot, NOT yet a revisioned recurring
work-hours preference source. Staging does not mutate live tasks.

confirm_calendar_draft(p_draft uuid,p_request uuid) -> jsonb

Request UUID is a unique idempotency key. Same key and draft replay the
original receipt; same key for another draft is rejected. Validates the
base plan version, draft expiry, task revisions/ownership, profile IANA zone,
manual locks, active focus and stored availability with a mandatory five-minute
post-task break. Uses the existing atomic batch RPC, then rechecks buffer
conflicts before committing receipts and incrementing the plan revision.
Unknown-end active focus sessions fail closed. Manual untouched blocks are
immovable obstacles. UTC begins are converted to local wall dates/times:
the earlier fall-back DST fold instant is unrepresentable by the old schema
and rejected; the later fold is accepted. Inclusive local-date deadline maps
to the start of the next local calendar day as an exclusive UTC instant.
No caller-provided task status or algorithm explanation is trusted as authority.

undo_calendar_plan(p_receipt uuid,p_request uuid) -> jsonb

Only the latest confirmed revision can be undone. Every affected task must
still match its after-revision, and no task may be newly locked. The inverse
reuses mutate_schedule, validates restored collisions and deadlines, and
updates the ledger in the same SQL transaction. Any error rolls back every
inverse edit. Repeating an identical undo request returns its prior receipt.

## Known release blockers

- External-calendar fixed events are not yet persisted; no imported event
  is silently treated as free time. A future event source requires owner,
  timestamp, provenance and version validation before enabling integration.
- User-defined availability is a draft snapshot. An authoritative,
  versioned work-hours preference source is not integrated.
- Schedule source/provenance beyond explicit manual locks and receipts is
  not fully wired into the scheduler/preview REST/UI flow.
- Legacy authenticated direct UPDATE is intentionally still granted for
  old clients. It is serialized but lacks task CAS, so a same-account old
  client may intentionally create an overlap after confirmation.
- Mixed row-first direct writes and advisory-first RPC calls can cause a
  PostgreSQL 40P01 deadlock. Retry after rereading with bounded backoff;
  reuse the same request UUID when an outcome is unknown. SQLSTATE 40001
  needs a fresh preview, not blind replay.

### Verified permission-tightening plan — NOT performed

1. Inventory web, mobile, REST and MCP versions and measure which paths use
   raw UPDATE, including offline queues and focus session mutations.
2. Test latest and old clients against disposable Postgres and a dedicated
   non-production Supabase instance. Assert revision and ownership failures.
3. Replace revision-critical SECURITY INVOKER permissions with narrowly
   reviewed, authenticated and owner-scoped guarded entrypoints before
   revoking raw scheduling-field UPDATE. Blind revocation also breaks
   the current legitimate invoker RPC.
4. Roll out compatible clients and monitor real stale-version/permission
   errors. Only then revoke direct scheduling-field UPDATE in a separately
   approved migration, with explicit backout and device-upgrade policy.
5. Repeat two-account isolation, old-client bypass and concurrency tests.
   No production change is authorized by this document.

## Test matrix and rollback

- supabase/tests/calendar_plan_ledger.sql: SQL grants, owner RLS,
  version-bound draft, confirm/replay, same-key handling, stale state,
  owner isolation, CAS undo and rollback-only fixtures.
- scripts/postgres-calendar-concurrency.mjs: all migrations applied to
  disposable PostgreSQL 17, two independent psql connections, observed
  lock wait, stale untouched-row conflict, complete rollback.
- .github/workflows/ci.yml: independent postgres-calendar job using
  a temporary Docker service, no hosted Supabase keys.
- supabase/rollback/calendar_plan_rollback.sql: disposable rollback of
  F2-B03-only objects. Integration asserts tasks survive and the F2-B02
  batch RPC remains. Production ledger deletion would lose receipt history:
  backup, retention and separate authorization required.

Required gate: real PostgreSQL CI + PGlite unit suite both successful,
independent QA and architecture review, frozen algorithm/UI mapping,
hosted migration drift clearance and separate deploy authorization.
A PR or a green CI check alone is NOT production acceptance.

## Derived progress restoration (F2-B03)

The existing `schedule_progress` BEFORE UPDATE trigger recomputes
`deferral_count` and would otherwise overwrite the inverse CAS snapshot.
F2-B03 keeps ordinary trigger behavior and allows restoring the previous
counter only while the transaction is running as the database's trusted
`postgres` function owner **and** the transaction-local
`focus_calendar.undo_restore` flag is enabled inside `undo_calendar_plan`.
A client setting the same flag while authenticated is explicitly tested to
have no effect. The undo entrypoint sets the flag for just the counter UPDATE
and turns it off immediately. Normal metadata edits remain subject to the
existing progress trigger. The disposable rollback also restores the original
trigger function, and is intentionally outside the automatic SQL test directory.
