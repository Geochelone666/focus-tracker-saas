# Focus 2 roadmap status — 2026-11-27

The supplied roadmap is staged by acceptance evidence. This is a status ledger,
not a claim that implementation or synthetic tests complete the whole roadmap.
The original attachment ends midway through Phase 6. At the user's request, the
[supplemental delivery plan](focus2-next-plan.md) now specifies the subsequent
trial, privacy, mobile and public-release work; it is separate from the source.

| Phase | Current evidence | Remaining completion prerequisites |
|---|---|---|
| 0: safety/integration | Integrated application at `9649759`, 612 unit/action tests in 58 files, SQL migration regressions, real PostgreSQL concurrency, fixture browser workflow, exact-commit GitHub CI and Vercel Preview | Complete hosted registry/schema evidence for #55, two real GoTrue identities, independent contract/security/design agreement for #74 |
| 1: usable Smart Calendar | Experimental real-data preview, selection/edit/confirm/reload/undo, day comparison, versioned locks, persisted work hours and draft metadata; default flag off | Resolve remaining protocol/authority gaps below, independent acceptance and hosted end-to-end verification |
| 2: execution/plan feedback | Experimental calendar execution entry, unfinished/interrupted block review, saved remaining estimate/resume context, CAS edits, pagination and mobile browser workflow on `feat/f2-execution-recovery`; reuses V1 focus accounting | Automatic remaining-day suggestions, integration of remaining estimates into planning, and genuine user-journey acceptance; not release-accepted |
| 3: personalization | Pure historical estimator/evaluation helpers and synthetic benchmarks exist | Authorized sufficient real pilot data, repeatable improvement over baseline; no production personalization enabled |
| 4: external integrations | No Google/Outlook calendar connection delivered | OAuth application configuration, authorized test calendars, owner-isolated read-only sync/revocation testing; writeback remains separately opt-in |
| 5: advanced planning/AI | Baseline deterministic scheduling and existing scoped AI/MCP entrypoints | Evidence-driven splitting/dependencies/capacity work after stable earlier stages; optional AI must not become a hard dependency |
| 6: maturity | Guided onboarding, CSV and experimental account JSON export, atomic connection revocation/reminder pause, confirmed password/email/TOTP account deletion with fixture coverage | Hosted onboarding/export/deletion acceptance, OTP template and delivery, OAuth identity linkage, additional MFA methods, backup recovery and real-device acceptance |

## Current candidate and release conditions

`release/f2-candidate` assembles the verified application through
[#98](https://github.com/Geochelone666/focus-tracker-saas/pull/98) for one review
against `main`. The feature PRs retain their individual changes and test history.

The source application commit `9649759` passed GitHub `ci`, `e2e`, `mobile`
and `postgres-calendar`, plus Vercel Preview. The fixture browser run covered
390px onboarding, schedule confirmation and undo, recovery, export, privacy
controls and email/TOTP deletion. It included one-time email code consumption
and a simulated lost deletion response. The offline preflight validated all
39 local filenames. The hosted migration registry has not been read.

| Release condition | Current evidence | Next required result |
| --- | --- | --- |
| #55 migration reconciliation | Read-only registry and schema queries in #87; complete disposable PostgreSQL replay and regressions | Intended project's complete registry and schema inventory, reviewed mapping and disposable reconciliation rehearsal |
| #74 contract agreement | Mapping in #85; guarded writes, error categories and engine/oracle regressions | Independent agreement on version/provenance and fingerprint semantics, plus hosted two-user acceptance |
| Hosted privacy | Mocked GoTrue boundaries and real fixture cascade deletion, including a preserved second account | Dedicated hosted test account, real OTP template/delivery and provider/MFA verification, actual backup/log retention |
| Devices and operations | Chromium 390px workflow and mobile build/export checks | Physical-device receipt and recovery rehearsal |

The Supabase browser session was still on its sign-in page during the
2026-11-27 check. Vercel Preview build success is recorded separately from the
authenticated application and hosted-schema acceptance above. Existing
experimental switches retain their defaults in source.

## Contract and hosted evidence

GitHub API access is available. Issue [#74](https://github.com/Geochelone666/focus-tracker-saas/issues/74)
is OPEN, labelled **INTERFACE BASELINE / NOT RELEASE-ACCEPTED** in its body. The
algorithm [handoff](https://github.com/Geochelone666/focus-tracker-saas/issues/74#issuecomment-6620762535)
and backend [handoff](https://github.com/Geochelone666/focus-tracker-saas/issues/74#issuecomment-6620792042)
ask for explicit agreement and independent review. They do not supply final
acceptance. The user's later PR/merge authorization remains valid; old issue
statements are not a reason to ask for that authorization again.

Concrete remaining boundary work from that comparison:

- Preview uses the canonical adapter and engine output. The staging overload now
  persists `schema_version`, `input_fingerprint`, parent plan and work revision.
  The fingerprint is provenance supplied with the preview, not server-attested
  authority. Independent agreement on that mapping remains outstanding.
- Work hours are now owner-scoped, persisted and versioned. The new UI drafts
  validate that revision at stage and confirmation, including change-and-change-
  back. Legacy drafts validate current saved windows but have no original work
  revision. External fixed events and weekly exceptions are not ingested.
- Accepted provenance is reconstructed from unchanged rows in a bounded receipt
  scan. The current snapshot UUID represents the assembled snapshot; that
  representation needs explicit agreement with the accepted-version semantics.
- Legacy direct writes remain granted for compatibility. They are serialized
  during confirmation but can intentionally overlap after it; revoking permissions
  requires the documented client compatibility review, not a blind migration.
- SQL identities are not GoTrue sessions. Neither local two-owner RLS tests nor
  fixture HTTP authentication establishes hosted two-user login acceptance.

Issue [#55](https://github.com/Geochelone666/focus-tracker-saas/issues/55) is OPEN.
Its handoff reports 25 main files and 17 remote registry rows with no exact version
matches at inspection. This does not mean their SQL effects are absent. The
[worksheet](f2-migration-worksheet.md) records the earlier 33-file integration
snapshot and keeps unknown mappings blocked. The current candidate contains
39 migration files, including 14 additive SQL files relative to `main@442840b`. A complete sanitized registry and schema-only
snapshot is needed before a reviewed disposable reconciliation rehearsal.

## Historical delivery blocker

The original cloud environment rejected GitHub API requests while Git transport
and public HTML remained available. Local GitHub API access was restored on
2026-11-14. The current stack has completed remote CI and Preview builds.
Hosted Supabase metadata, real test-login bindings and independent acceptance
remain outstanding.

The independent [execution recovery increment](f2-execution-recovery.md) is stacked
on that integration branch and kept behind its own default-off flag. Its additive
migration is file 34; the earlier 33-file worksheet intentionally describes the
Phase 0 integration snapshot, not the newer Phase 2 branch. The new local tests
provide implementation evidence, not a substitute for the remaining gates above.

The [work-hours increment](f2-work-hours.md) is stacked next on
`feat/f2-authoritative-work-hours`, with migration file 35. It closes the
client-only work-window authority gap for the new preview workflow. These local
implementation updates do not change the hosted access or review prerequisites.

The independent [account-export increment](f2-account-export.md) is stacked on
`feat/f2-account-data-export`, with migration file 36 and its own default-off flag.
Recovery-to-rescheduling still needs separate task-estimate and future-block-length
semantics: using `remaining_minutes` to overwrite the existing `estimated_minutes`
would change the planned-vs-actual baseline. That model change has not been hidden
inside this export work or claimed as complete.

Export review found numeric segment pagination could omit records after IDs were
cast to text. The additive correction on `fix/f2-export-segment-pagination`
(migration 37) restores native ordering. The regression demonstrates 196/206
records with the old function and all 206 after correction, across page sizes
100 and 7. Existing old-function exports should be regenerated. Hosted acceptance
and the rest of the roadmap remain outstanding.

The [first workflow guide](f2-first-workflow.md) is stacked on the export
pagination correction. It reuses existing task and focus data and adds no migration.
GitHub API access was restored on 2026-11-14 and stack review began in PRs
[#80 through #84](https://github.com/Geochelone666/focus-tracker-saas/pull/80).
Hosted migration reconciliation and independent release acceptance remain open.


## Privacy access controls

Settings now provides a confirmed account-scoped operation to revoke existing AI
keys and pause registered device reminders in one transaction. The invoker RPC
uses existing owner policies and privileges. Retrying preserves revocation times,
and a failure in either update rolls back the operation. Tasks and focus records
stay accessible. Requests and notifications already in flight may finish.

Migration `20261126000000_privacy_access_controls.sql` brings the integrated
migration set to 39 files. This increment completes connection controls within
Phase 6A. Account deletion implementation is recorded below; backup retention
verification and hosted privacy acceptance remain open.


The [account deletion increment](f2-account-deletion.md) adds explicit confirmation,
password reauthentication, MFA assurance checks and server-only GoTrue deletion.
Its SQL fixture checks cascades across every owned collection and preservation
of a second account. It adds no migration. The deletion form now supports an owned TOTP authenticator challenge. Hosted
GoTrue/TOTP, additional MFA methods and backup-retention acceptance remain open.


Account deletion also supports verification through the signed-in owner's email.
The server disables signup, verifies the returned owner and retains the
authenticator challenge. Local email fixtures cover sending, wrong codes and
MFA. Hosted OTP template/delivery, provider linkage and additional MFA methods
remain release prerequisites.
