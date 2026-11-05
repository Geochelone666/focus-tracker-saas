# Focus 2.0 Phase 0 integration

This branch integrates existing work against main `6c53e29`. The supplied
[roadmap](focus2-roadmap.md) ends at Phase 6's mobile bullet; later text was not
provided. This receipt takes precedence over historical per-branch status notes.

## Integrated sources

- Algorithm and data adapter: `1c3bf7e` (includes F2-A02).
- Batch guards, plan ledger, idempotency and CAS undo: `5bae36f` (includes F2-B02).
- Explicitly labelled preview demo: `63843c1`.
- Calendar interaction fixes: `ad54522`.
- Independent QA oracle and database tests: `98b8223`.
- Read-only migration drift preflight: `e3537f4`.

The same QA oracle is retained without divergent copies. Both screenshot sets
are uploaded by one CI artifact step. Existing full migration tests now have
an explicit 60-second budget; assertions and individual SQL checks are retained.
The integration also removes a dashboard variable left unused by the interaction
branch.

## Boundary resolved in code

`calendarDraftArguments` connects the existing algorithm envelope to B03 staging:
selected changed placements only, 1–50 task limit, exact task revisions, owned
availability and UTC minute strings without `.000`. It rejects unrepresentable
DST starts using the existing later-fold check. The database bigint revision is
passed as a decimal string; the accepted-version UUID is never coerced into it.
This is encoding, not an authorization boundary. RPCs still authenticate and
recheck all constraints. A migrated SQL integration test runs real engine output
through stage, confirm, idempotent replay, other-owner denial, undo and replay.

## Release gates and next work

1. **Read, not release-approved:** Issue #74 was inspected through the public
   GitHub page on 2026-11-05 (API still Forbidden). It is the authoritative
   interface baseline; its algorithm/backend comments request further review,
   not final sign-off. Local adapter documents are implementation notes. See
   [the current roadmap status](f2-roadmap-status.md) for unresolved protocol gaps.
2. **Implemented locally:** integrated algorithm/backend/QA and wire encoding.
3. **Implemented experimentally:** bounded statement-consistent snapshot and real
   preview/selection/edit/confirm/reload/undo at `/calendar/smart-plan`. See
   [the live workflow receipt](f2-live-calendar.md). Feature flag defaults off.
   The existing `/calendar/smart-preview` remains an explicit fixture demo.
   Independent contract/security/design review remains required before release.
4. **Locally verified:** PostgreSQL 17 independent-connection locking and atomic
   rollback, two SQL identities under RLS, confirmation/replay/undo and disposable
   rollback preserving tasks. These are not two real GoTrue logins.
5. **Blocked:** Issue #55 remains open. Its public handoff reports mismatched
   registry IDs across the full main history. A [33-file worksheet](f2-migration-worksheet.md)
   records local hashes and the six documented aliases; the other reported remote
   rows and current SQL effects still need a complete hosted snapshot. Partial
   metadata correctly fails the read-only preflight.
6. **Pending:** GitHub CI, Vercel Preview, independent QA/design review at the
   combined SHA, hosted auth and physical-device acceptance.

Do not merge/release this integration as a completed Smart Calendar feature.
No hosted migrations, production configuration or permissions were changed.
Phase 1 follows gate clearance; Phases 2–6 retain the order in the roadmap.

## Verification on the integration branch

- `npm test`: 555 tests in 48 files passed, including migrated algorithm-to-RPC
  integration, owner isolation, replay and undo.
- `node --test scripts/migration-drift-preflight.node-tests.mjs`: 12 passed.
- `npm run typecheck`, `npm run lint`: passed, zero lint findings.
- `npm run build`: passed using unreachable local Supabase test configuration.
- PostgreSQL 17 Docker service: the existing two-connection regression passed
  all migration, lock-wait, conflict, retry, RLS, undo and rollback assertions.
  A local `psql` wrapper used `docker exec` with stdin and PGAPPNAME preserved;
  the CI job continues to use its native PostgreSQL client.
- Chromium `scripts/e2e-focus.mjs`: passed the existing authenticated fixture
  workflow, calendar interaction checks and labelled preview-demo checks at
  desktop and 390px. Mobile screenshot inspected; no horizontal overflow.

Browser authentication is a local fixture. SQL test identities do not establish
hosted GoTrue login coverage. The demo screenshot is not a real saved proposal.
- Auth-guard Chromium regression: 12 protected routes, forged-cookie rejection,
  login error state and 390px checks passed.
- Optional mobile `npm run typecheck`: passed.

Delivery: branch `feat/f2-phase0-integration` pushed successfully. Creating the
requested draft PR failed with GitHub GraphQL `Forbidden`; no PR number or
external CI result is claimed. Git transport remains usable. No main merge was
performed. PR text is prepared locally at `/tmp/f2-phase0-pr.md` for retry.

The user subsequently authorized PR creation and merge after GitHub checks pass.
That supersedes older no-merge wording as an authorization constraint; it does not
make missing CI, independent review or hosted acceptance evidence pass.
