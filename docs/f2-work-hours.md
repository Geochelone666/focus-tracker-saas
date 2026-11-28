# Persisted Smart Calendar work hours

This increment is stacked on `feat/f2-execution-recovery`. The existing
`FOCUS_SMART_CALENDAR_ENABLED` flag remains off by default. No production flag,
migration registry, service permissions or user records were changed.

## User behavior

The first preview requires **Save work hours**. Saved hours initialize the form
on another device or after reload. They apply to every selected day, including
weekends; the horizon still supports 1–14 days. This is a daily local-time policy,
not a weekly preference editor or an external-calendar connection.

Editing the hours keeps existing task edits but disables generation/confirmation
until the hours are saved and a fresh preview is generated. Saving uses the exact
preference revision. A stale-device save preserves the input and asks the user to
reload. A change-and-change-back still invalidates an older draft. Plan confirmation
never silently changes these preferences. Undo restores task times without undoing
an unrelated preference edit.

## Database and contract

Apply `20261106010000_calendar_work_preferences.sql` after prior migrations
(35 files on this branch), only after the hosted registry reconciliation gate.
The new table has owner SELECT RLS; direct client INSERT/UPDATE/DELETE are revoked.
The only write RPC authenticates the owner, validates the account timezone, takes
the shared owner advisory gate, and compares the exact bigint revision. Revisions
cross the JavaScript boundary as strings. Work hours must be same-day minute
labels from 00:00 through 23:59; overnight windows are not introduced here.

The snapshot returns preferences in the same SQL statement as tasks and plan
state. The existing staging RPC has an additive five-argument overload carrying
`schema_version`, `input_fingerprint`, `base_version_id`, and `work_revision`.
The UI uses the canonical adapter output fields; the draft persists them.
Unknown schemas and malformed fingerprints/revisions fail closed. Parent plan
identity, plan revision, owner, timezone, task versions and saved windows are
validated independently.

**The fingerprint is supplied preview provenance, not authorization or a
server-attested snapshot.** Its shape is validated and it is stored unchanged;
this does not prove that the client generated the unmodified engine proposal.
Manual edits remain deliberate user input and pass the same transactional
validators. Issue #74's independent representation/authority agreement is still
outstanding; this change does not claim to freeze or fully approve that contract.

Every provided UTC work window must exactly match the saved local hours, with the
existing later-fold DST rule and gap rejection. Confirmation's receipt trigger
checks the preference revision and windows while the confirmation transaction
holds the owner gate. Failure rolls back task writes, state revision and receipt.
The existing idempotent-receipt replay occurs before new writes, so a successful
request remains replayable after preferences change.

Legacy staging signatures remain for compatibility. When saved preferences exist,
legacy confirmations must also honor their current windows. Legacy drafts lack
the new preference revision, so they cannot provide the new ABA detection; they
still validate the saved hours at confirmation. No direct task-write or AI/MCP
permissions are expanded. Direct/manual task editing remains governed by its
existing compatibility rules, not this scheduler-specific work-hours policy.

## Rollback and validation

Disable the experimental flag and revert the application if needed. Keep the
preferences, additive draft columns and receipt guard: removing the guard while
allowing confirmations would remove the new validation. Do not drop user data.
Earlier application builds may display stale draft-window errors after a user
has saved hours; keeping the feature off is the supported application backout.
The disposable original-ledger rollback runner explicitly removes the new trigger
and overload before exercising its old teardown; this is not a production script.

Validation covers owner isolation, anonymous/direct-write denial, malformed
contract versions, forged windows, stale preference saves, ABA invalidation,
atomic rejection, idempotent confirmation after preference edits, undo and legacy
window validation. The PostgreSQL 17 runner observes a real lock wait between a
preference writer and a confirming device, then checks no task/ledger mutation.
The 390px browser workflow saves/reloads hours, rejects stale previews and retains
stale preference input before reloading the other device's saved hours.

Hosted GoTrue, Vercel Preview, real devices, complete registry/schema reconciliation
and independent acceptance remain unverified. The broader next steps are in
[the supplemental delivery plan](focus2-next-plan.md).

Local verification on 2026-11-06: **575 tests / 53 files passed**, along with
typecheck, lint (no findings), production build, the full PostgreSQL 17 runner and
the Chromium workflow. All 35 migrations applied in order to disposable SQL
databases. Offline filename preflight reports no findings; remote inventory is
not included. The browser screenshot
`test-artifacts/f2-f02-work-hours-mobile.png` was inspected for overflow and draft
retention. Existing CI uploads that screenshot pattern when the job runs.
