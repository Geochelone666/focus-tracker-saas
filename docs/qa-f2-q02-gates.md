# F2-Q02 — Independent QA release gates (2026-11-01)

**Purpose:** focused acceptance checklist and test evidence for Sprint 02. This is not a deployment receipt. The QA branch is tests-only; it does not alter business logic, migrations or production data.

## Baseline and verification types

- Review base: `main@6c53e292a26e035a19897585e6e2e9fb00926246`.
- Baseline main Actions run [41231847898](https://github.com/Geochelone666/focus-tracker-saas/actions/runs/41231847898): 35 Vitest files / 409 tests passed, web lint/typecheck/build, fixture-backed browser E2E, mobile type/check/export passed.
- Distinguish: **CI receipt** vs **independent PGlite/Postgres role test** vs **fixture browser test** vs **real hosted GoTrue/PostgREST test** vs **physical device test**. CI green is not a substitute for the latter two.
- New F2-Q02 suites are `lib/qa-database-contract.test.ts`, `app/calendar/block-actions.test.ts`, `qa/time-boundaries.test.ts`, `qa/scheduler-acceptance.test.ts` plus a keyboard-only step in `scripts/e2e-focus.mjs`.
- The scheduler oracle's self-tests verify **the oracle**, not F2-A02 algorithm behavior. The real algorithm must call the independent oracle through a non-production adapter.
- Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `node scripts/e2e-focus.mjs` only in a disposable, fixture-configured environment. Use the existing CI job as the authoritative reproducible execution context.

## Release gates — do not waive for demo convenience

| Gate | Required evidence | Stop condition |
| --- | --- | --- |
| Functional / scheduler | Real engine adapter; same input gives byte-identical normalized output; all candidates assigned or explained; locked blocks stable; all proposed intervals in available windows and before deadlines; no proposal overlap | Any unassigned task silently dropped; hard constraint violation; nondeterministic output |
| Data integrity | PGlite **and real test project**: owner-scoped reads/writes, revision-checked batch atomicity, concurrent modified unselected blocks, duplicate IDs, replayed/reordered requests, stale/foreign IDs, partial failure, discard and undo after later external edit | One partial commit, silent lost update or cross-owner row access |
| Auth / security | Two non-production real GoTrue users; authenticated browser and raw PostgREST/MCP requests; sign-out/re-login token expiry and revoked key behavior; RLS and grants inspected at exact release SHA | Any cross-user data exposure or unauthorized privileged mutation |
| Calendar correctness | Spring DST gap, fall DST fold, 23/25-hour days, timezone change, year-end and overnight blocks, exact-touch boundaries, deadline equality, completed/trashed tasks excluded | Temporal arithmetic or collision mismatch |
| Experience | 390px touch/keyboard interaction, visible preview vs current plan, explanation/rejection, error and retry, controlled undo; basic axe-style checks for labels, focus order and contrast | Blocking controls inaccessible or a failed action clears user input |
| Performance | Fixed 100/500/1000-task 7–14 day fixtures with declared machine/Node versions, p50/p95 and memory; query count and bounded access measured | Unbounded history reads in preview or unacceptable main-thread stalls |
| Recovery | Disposable hosted staging migration/rollback rehearsal, previous compatible app build, retry and network loss, browser refresh/reload, two-device stale update | Destructive rollback, lost accepted plan or unrecoverable conflict |
| Production | Independently reconciled migration inventory + schema, required checks on exact SHA, Vercel Ready matching SHA, limited real-user smoke tests and physical device authorization | Drift #55 unresolved or unverified deployed commit |

**No production fixtures:** Never execute `supabase/tests/*.sql` against production. Never use production account content, access tokens or device subscriptions in QA artifacts.

## Review notes for parallel Sprint 02 PRs

- **F2-I02 PR #68:** offline migration preflight correctly fails closed for known mismatches, but `complete:true` is asserted by the supplied JSON and is not cryptographic proof that the export came from the intended live database. Local-only CI mode is explicitly not remote parity. #55 and live schema verification remain release blockers.
- **F2-B02 PR #69 (unmerged):** `apply_schedule_batch` adds owner/revision checks and all-or-nothing SQL statement semantics; SQL regression covers rollback, foreign/duplicate IDs, DST and overlaps. However, selected rows alone are locked; overlapping unselected rows may be changed concurrently through `mutate_schedule` or direct mobile UPDATE. The current batch RPC does not itself validate task `deadline`, permitted working windows or protected/accepted lock identities, and supplies no accepted-plan undo. **Do not treat the PR as final scheduler acceptance.** These are integration release gates, not a claim of a demonstrated exploit.
- **Existing web/calendar E2E:** real Next actions + PGlite with a local Supabase protocol fixture. It does not exercise real auth token lifecycle, hosted RLS, physical browser device interrupts or a real Smart Scheduler preview/accept/undo (not yet available on the reviewed base).
- **Mobile:** web 390px E2E and Expo offline export do not prove a native installed iOS/Android app. Obtain physical device evidence before a native release.

## Independent execution follow-up

1. Merge only after passing CI **and** independent review, never directly from this QA branch.
2. Re-run exact new test files against the Algorithm and Backend PR integration SHA; record commits and CI run IDs, not only counts.
3. In a **dedicated non-production Supabase project** with two real accounts, exercise unauthorized read/write; API grants; stale/duplicate/parallel writes; atomic rollback; and refresh after persistence.
4. Run visible browser journey: Inbox capture → Smart Scheduler preview → manual adjust → selected accept → refresh → focus/pause/resume → planned/actual → undo. Until implemented, mark these tests **BLOCKED / NOT RUN**, never `PASS`.
5. Test two real devices and keyboard/VoiceOver/TalkBack with basic focus/contrast checks before production acceptance.

**Status:** CONDITIONAL for existing Focus foundation; **FAIL / NOT ACCEPTED** for Smart Scheduler MVP release until the above gates have independent real-environment evidence.
