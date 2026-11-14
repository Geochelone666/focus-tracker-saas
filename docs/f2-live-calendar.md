# Experimental Smart Calendar: real preview and commit workflow

The `/calendar/smart-plan` route now reads real owner tasks and supports generating
suggestions, selecting/editing changes, confirming, refreshing and undoing. It is
separate from the labelled fixture demo. The entry and every Server Action require
`FOCUS_SMART_CALENDAR_ENABLED=true`; the default is disabled. Enable only in a
reviewed isolated environment after applying the integration migrations. No
production flag or hosted schema was changed by this work.

## Data and authority

- `calendar_preview_snapshot()` is a STABLE SECURITY INVOKER SQL function. One
  statement reads the owner-scoped task/lock/receipt/version state under RLS.
  It returns at most 501 open tasks; the adapter refuses more than 500 instead
  of silently ignoring obstacles. Reads of receipt history stop at 200 entries.
- Only unchanged task revisions backed by confirmed receipts count as accepted
  scheduler placements. Older history outside the bounded lookup, manually
  changed tasks and manually timed tasks are conservatively fixed. The latest
  receipt UUID labels the assembled snapshot; individual acceptance evidence
  remains in stored receipts. The bigint CAS revision is a separate string.
- The user chooses 1–14 days and explicit daily work windows (including weekends).
  UTC instants use account IANA time, reject DST gaps and use the later fold.
  Untimed locked tasks are excluded; active focus refuses preview. No external
  calendar connection or history-based personalization is inferred.
- Selected changes retain original microsecond revisions. A new staging wrapper
  checks the preview timezone while holding the profile row lock. Confirm/undo
  still use the existing B03 atomic validators, receipt IDs and revision checks.
  Manually edited slots get the same validation as algorithm placements.
- Pending confirmation IDs are kept in component state and, when browser storage
  is available, owner-namespaced localStorage. Retry reuses the request UUID.
  Undo also reuses its request UUID. No auth tokens or task contents are stored.
  After refresh the database snapshot supplies the latest undoable receipt.

## Deployment and rollback

Apply `20261104000000_calendar_preview_snapshot.sql` then
`20261104010000_calendar_lock_controls.sql` after all existing F2-B02/B03
migrations, only after the Issue #55 migration-drift gate is cleared. The migration
adds two narrow functions and no tables, data rewrites or new client table grants.
Disable the feature flag to hide the route and reject its actions. To remove just
this migration in an isolated rehearsal:

```sql
drop function public.set_calendar_task_lock(uuid,timestamptz,timestamptz,boolean);
drop function public.stage_calendar_preview(jsonb,jsonb,bigint,text);
drop function public.calendar_preview_snapshot();
```

Remove these entrypoints before rehearsing the earlier ledger rollback. Saved
plans and receipts are retained when disabling the feature or dropping these
functions. Do not drop ledger tables as a production backout.

## Validation and remaining gates

Unit/action checks cover feature gating, authentication, owner isolation, read
bounds, invalid windows, DST gaps/folds, fixed/locked task preservation, exact
revision encoding and retry IDs. The migrated algorithm-to-RPC regression now
uses the real snapshot and staging wrapper, checks accepted-plan preservation,
timezone mismatch, other-owner isolation and replay/undo. SQL snapshot policy
checks also run in the PostgreSQL 17 two-connection test job.

The Chromium fixture drives the real Next actions and migrated database through
390px generate → selective accept → manual 14:00/90-minute edit → confirm → reload
→ undo, and refuses a task modified after preview. This still uses local GoTrue/
PostgREST fixtures; no hosted browser acceptance is claimed.

Issue #74 agreement, Issue #55 drift reconciliation, external CI/Preview status
and independent QA/design review remain release gates. The preview now has account-local day timelines with original/selected columns
on desktop and a single-view toggle on mobile. Users can lock or unlock tasks
with exact task/lock version checks. These interfaces still require independent
design acceptance and hosted device verification. Therefore this is an experimental integration,
not completed Phase 0/Phase 1 or a production-ready Smart Calendar release.

### Local verification receipt

- Full suite: **562 tests / 50 files passed**.
- After adding the final SQL permission checks: all **8 migration-suite cases**
  passed, including every SQL regression file.
- `npm run typecheck`, `npm run lint` (zero findings), `npm run build`: passed.
- Chromium full workflow plus real Smart Calendar selective edit / confirm /
  refresh / undo / stale-device rejection: passed at 390px. The actual edited
  mobile preview screenshot was inspected for layout and horizontal overflow.
- Fresh PostgreSQL 17: snapshot owner/anonymous permission checks, ledger tests,
  observed dual-connection lock wait, rejected conflict, bounded explicit retry,
  CAS undo and rollback retaining tasks passed.
- GitHub GraphQL and REST PR creation returned `Forbidden`. No external CI or
  Vercel Preview acceptance is claimed for this combined branch.


## Calendar comparison and task protection

- The timeline is derived from the **current selection and manual edits**, not
  merely the original algorithm result. Deselecting restores the original slot;
  existing fixed and locked blocks remain visible. Dashed blocks identify edits.
- Day boundaries use account-local midnight. The axis uses elapsed minutes and
  shows UTC offsets, so repeated fall-back hours and 23/25-hour days are distinct.
  Overnight blocks are clipped to the selected day; overlapping originals use
  separate lanes. Full details remain in the accessible task forms.
- Overlap and five-minute break/work-window warnings provide immediate feedback.
  The database still checks deadlines, ownership, versions and all constraints
  before any write; client warnings do not authorize or bypass a commit.
- Changing a work window preserves the unsaved task edits but disables confirmation
  until a new preview is generated. Editing the window during a request is disabled.
- Task protection works for both timed tasks and Inbox tasks. Changing a lock
  explicitly clears the old preview. Unlocking a manual block does not convert
  it into a scheduler-owned placement; provenance is preserved.
- `set_calendar_task_lock` is SECURITY INVOKER, owner-scoped and serialized with
  the same owner gate as confirmation. It compares both the task timestamp and
  the existing lock creation timestamp. An old device cannot unlock a newer
  replacement lock (including lock/unlock/lock cycles). No task times are edited.
- The snapshot now includes `lock_versions` as exact timestamp strings. New RPCs
  are denied to anonymous callers; the AI/MCP interface is unchanged.

The newest migration can be disabled through the existing feature flag. Dropping
only `set_calendar_task_lock` disables its UI entrypoint; persisted locks stay
intact. Restoring the prior snapshot definition would remove version metadata and
requires keeping this UI disabled. Neither rollback requires deleting task data.

### Comparison and lock-control verification

- Full suite: **567 tests / 51 files passed**; typecheck, lint (zero findings)
  and production build passed.
- Comparison regressions cover selected/manual edits, deselection, fixed locks,
  collisions and break/window warnings, overlapping lanes, overnight clipping,
  and 23/25-hour daylight-saving days.
- SQL checks reject foreign/anonymous access, stale task timestamps and an old
  device trying to unlock a replacement lock. The PostgreSQL 17 dual-connection
  test observes the second lock request wait, then rejects its stale expectation
  without replacing the first lock. Existing confirm/undo/rollback tests pass.
- Chromium at 390px verifies lock persistence across refresh, exclusion of locked
  Inbox tasks, unlock/regenerate, timeline switching, manual edit reflection,
  work-window invalidation with retained edits, confirmation/reload/undo and stale
  device rejection. The updated mobile screenshot was inspected; no horizontal
  document overflow was detected.
- GitHub API access still returns Forbidden. No PR creation, remote CI, hosted
  migration, independent review or production acceptance is claimed.

### Canonical-contract follow-up

Public Issue #74 was read on 2026-11-05; the API remains inaccessible. Its explicit
concurrent-INSERT gate now has a real PostgreSQL regression: one connection inserts
an uncommitted overlapping task while another confirms a staged draft. A lock wait
is observed before the insert commits. Confirmation then rejects the new overlap,
leaves the selected task untouched, creates no receipt and does not increment the
plan revision. The full PostgreSQL concurrency/owner/rollback runner passed with
this additional case. This does not clear the separate hosted identity and release
gates documented in [the roadmap status](f2-roadmap-status.md).
