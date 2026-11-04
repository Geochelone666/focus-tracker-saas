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

Apply `20261104000000_calendar_preview_snapshot.sql` after all existing F2-B02/B03
migrations, only after the Issue #55 migration-drift gate is cleared. The migration
adds two narrow functions and no tables, data rewrites or new client table grants.
Disable the feature flag to hide the route and reject its actions. To remove just
this migration in an isolated rehearsal:

```sql
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
and independent QA/design review remain release gates. Fixed blocks are listed,
not yet drawn as ghost blocks on the calendar. Lock creation and richer visual
comparison remain follow-up UI work. Therefore this is an experimental integration,
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
