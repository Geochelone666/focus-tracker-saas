# Smart Calendar v0.1 implementation review

Compare [issue #74](https://github.com/Geochelone666/focus-tracker-saas/issues/74)
with the persisted work-hours branch at `6437540`. Issue #74 owns changes to the
interface contract.

| Boundary in #74 | Current implementation | Review evidence or open decision |
| --- | --- | --- |
| Read-only preview | `generateCalendarPreview` loads `calendar_preview_snapshot` under the authenticated owner. `liveCalendarPreview` maps into `SmartCalendarSnapshotV01`; `previewSmartCalendar` calls the canonical adapter and engine. | The live path bounds the read to 501 open rows and rejects above 500. It also blocks preview while focus is active. It currently supplies empty history and external busy intervals. |
| Plan revision and accepted provenance | `revision` is the current numeric plan CAS value, carried as text. `base_version_id` is the latest receipt UUID by confirmed revision, or null, including after undo. Accepted task IDs come from still-confirmed receipts whose after-row timestamp still matches the live owner row. | The scan is limited to 200 receipts. Accepted blocks use the latest receipt as their common base ID and omit the original contributing receipt ID. Agree on latest-receipt semantics after undo and on per-task provenance before declaring the mapping accepted. A task with no matching receipt in the scan is treated as manual if timed. |
| Selected placements and input fingerprint | `stageCalendarSelection` sends the selected IDs, original full-precision timestamps and proposed account-local date/time/duration. It resolves them to minute UTC instants using the later fold and sends them with availability, plan/work revisions and canonical metadata to the five-argument `stage_calendar_preview`. The final confirm request carries the resulting draft ID and request UUID. | The server derives owner from auth. SQL checks the latest receipt and work revision. The browser echoes the adapter fingerprint; the staging RPC checks its format and stores it for provenance. It does not recompute or authenticate the fingerprint. Agree on that distinction from the stale-draft detector described in #74. |
| Atomic confirm and inverse CAS | `confirm_calendar_draft` uses the owner-scoped draft, locks, row timestamps, plan revision and request-ID receipt. The work-hours trigger checks persisted windows at receipt insertion. `undo_calendar_plan` checks the receipt and the current plan and row revisions. | The dedicated PostgreSQL runner exercises unselected UPDATE and INSERT, stale revisions, rollback and replay. Fixture authentication and PostgreSQL roles cover different paths from hosted two-user GoTrue. |
| Failure categories | Server Actions map `40001`, `23P01`, `22023` and `42501` to user-facing feedback; unexpected errors return retry feedback. | The deployed interface under review is a Server Action, with no public HTTP endpoint. Confirm and undo now return a stable `errorCode` alongside display text, with separate values for invalid input, unauthenticated requests, unavailable drafts or receipts, conflicts, retryable failures and disabled environments. Preview and staging still return display text. |
| Legacy write compatibility | Web task capture uses direct inserts; web block edits call `mutate_schedule`. `mobile/App.tsx` uses direct inserts and timestamp-checked updates. The SQL write gate serializes competing mutations during confirm. | Keep table writes available to those clients until their write paths have replacements with equivalent create, edit and completion behavior. A manual write after confirmation can still overlap. |

Implementation entry points are [the Server Actions](../app/calendar/smart-plan/actions.ts),
[the live snapshot mapper](../lib/smart-scheduler/live-preview.ts),
[the snapshot and work-hours migration](../supabase/migrations/20261106010000_calendar_work_preferences.sql),
and [the concurrency harness](../scripts/postgres-calendar-concurrency.mjs).

The review still needs independent agreement on the open mappings above, an
exact-head browser and PostgreSQL result, two hosted test identities, and the
migration reconciliation in [issue #55](https://github.com/Geochelone666/focus-tracker-saas/issues/55).
