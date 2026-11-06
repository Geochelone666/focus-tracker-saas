# Focus 2 roadmap status — 2026-11-06

The supplied roadmap is staged by acceptance evidence. This is a status ledger,
not a claim that implementation or synthetic tests complete the whole roadmap.
The attachment ends midway through Phase 6, after its mobile bullet.

| Phase | Current evidence | Remaining completion prerequisites |
|---|---|---|
| 0: safety/integration | Integrated code, 567 unit/action tests, migrated SQL, real PostgreSQL connection races, fixture browser workflow, offline preflight | Exact-head GitHub CI/Preview, complete hosted registry/schema evidence, two real GoTrue identities, independent contract/security/design agreement |
| 1: usable Smart Calendar | Experimental real-data preview, selection/edit/confirm/reload/undo, day comparison and versioned locks; default flag off | Resolve protocol and authority gaps below, independent acceptance and hosted end-to-end verification |
| 2: execution/plan feedback | Experimental calendar execution entry, unfinished/interrupted block review, saved remaining estimate/resume context, CAS edits, pagination and mobile browser workflow on `feat/f2-execution-recovery`; reuses V1 focus accounting | Automatic remaining-day suggestions, integration of remaining estimates into planning, and genuine user-journey acceptance; not release-accepted |
| 3: personalization | Pure historical estimator/evaluation helpers and synthetic benchmarks exist | Authorized sufficient real pilot data, repeatable improvement over baseline; no production personalization enabled |
| 4: external integrations | No Google/Outlook calendar connection delivered | OAuth application configuration, authorized test calendars, owner-isolated read-only sync/revocation testing; writeback remains separately opt-in |
| 5: advanced planning/AI | Baseline deterministic scheduling and existing scoped AI/MCP entrypoints | Evidence-driven splitting/dependencies/capacity work after stable earlier stages; optional AI must not become a hard dependency |
| 6: maturity | Existing web/mobile foundation, CSV and error states | Full remaining requirements (attachment truncated), onboarding/privacy/account-deletion/release and device acceptance; not delivered |

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

- Preview uses the canonical adapter and engine output. The current app staging
  action accepts local form edits and pins exact row/revision/timezone state,
  but does not carry the issue's complete logical `schema_version` /
  `input_fingerprint` request envelope. This needs a reviewed mapping, rather
  than treating a client fingerprint as an authorization token.
- Availability is the explicitly chosen draft window, not an authoritative,
  persisted, versioned preference source. External fixed events are not ingested.
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
