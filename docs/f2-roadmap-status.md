# Focus 2 roadmap status — 2026-11-11

The supplied roadmap is staged by acceptance evidence. This is a status ledger,
not a claim that implementation or synthetic tests complete the whole roadmap.
The original attachment ends midway through Phase 6. At the user's request, the
[supplemental delivery plan](focus2-next-plan.md) now specifies the subsequent
trial, privacy, mobile and public-release work; it is separate from the source.

| Phase | Current evidence | Remaining completion prerequisites |
|---|---|---|
| 0: safety/integration | Integrated code, 567 unit/action tests, migrated SQL, real PostgreSQL connection races, fixture browser workflow, offline preflight | Exact-head GitHub CI/Preview, complete hosted registry/schema evidence, two real GoTrue identities, independent contract/security/design agreement |
| 1: usable Smart Calendar | Experimental real-data preview, selection/edit/confirm/reload/undo, day comparison, versioned locks, persisted work hours and draft metadata; default flag off | Resolve remaining protocol/authority gaps below, independent acceptance and hosted end-to-end verification |
| 2: execution/plan feedback | Experimental calendar execution entry, unfinished/interrupted block review, saved remaining estimate/resume context, CAS edits, pagination and mobile browser workflow on `feat/f2-execution-recovery`; reuses V1 focus accounting | Automatic remaining-day suggestions, integration of remaining estimates into planning, and genuine user-journey acceptance; not release-accepted |
| 3: personalization | Pure historical estimator/evaluation helpers and synthetic benchmarks exist | Authorized sufficient real pilot data, repeatable improvement over baseline; no production personalization enabled |
| 4: external integrations | No Google/Outlook calendar connection delivered | OAuth application configuration, authorized test calendars, owner-isolated read-only sync/revocation testing; writeback remains separately opt-in |
| 5: advanced planning/AI | Baseline deterministic scheduling and existing scoped AI/MCP entrypoints | Evidence-driven splitting/dependencies/capacity work after stable earlier stages; optional AI must not become a hard dependency |
| 6: maturity | Existing web/mobile foundation and CSV; experimental paginated account JSON export with fixed projections and explicit read consistency; supplemental plan defines trial/public-release acceptance | Hosted export acceptance, guided onboarding, account deletion/privacy, operational recovery and real-device acceptance; not delivered |

## Fresh source inspection

Public GitHub HTML is readable even while the authenticated API proxy rejects
requests. Issue [#74](https://github.com/Geochelone666/focus-tracker-saas/issues/74)
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
[worksheet](f2-migration-worksheet.md) identifies all 33 current local files and
keeps unknown mappings blocked. A complete sanitized registry and schema-only
snapshot is needed before a reviewed disposable reconciliation rehearsal.

## Delivery blocker

The remote integration branch is preserved. GitHub API creation/read requests
remain Forbidden at the proxy; Git transport and public HTML reads work. Supabase
and Vercel tools and the test login bindings are absent from this execution
session. No PR or CI outcome can be fabricated from the public issue pages.
Do not enable the experimental feature or declare all phases complete to bypass
these acceptance gates. Continue from this ledger when the required access,
contract decisions and real evaluation inputs are available.

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
