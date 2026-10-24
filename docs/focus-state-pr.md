# Focus V1: persist pause/resume and countdown with atomic session transitions

Focus sessions previously measured the entire start-to-stop wall time and could not pause or count down. This change adds recoverable count-up/countdown sessions and shared Today/Dashboard controls. Pauses never earn focus time; countdowns cap at the target even when a tab is backgrounded; repeated completion retains the first duration and note. Abandonment preserves a zero-credit history row.

Database row locks, expected revisions, and the existing single-active unique index serialize device writes. Owner RLS and AI API/MCP scopes are unchanged. No heavy dependency or production configuration change is introduced.

Validation:
- `npm test`: 325 tests in 24 files, including filename-ordered migrations, all SQL regressions, history-preserving upgrade, rerun and non-destructive rollback.
- `npm run typecheck`, `npm run lint`, `npm run build`: passed (build uses documented unreachable Supabase test values).
- `scripts/e2e-focus.mjs`: real Next Server Actions against migrated PGlite; concurrent starts, pause/reload, simulated ten-minute pause, stale-device conflict, resume/finish/outcome, capped once-only 25-minute countdown, Today task association, abandonment, 390px layout. Added to CI.
- Existing auth-guard Chromium E2E: passed (10 protected routes, forged cookie, unreachable auth feedback, 390px).

Migration: apply `20261024000000_focus_state.sql` after all previous migrations, before deploying the application. It is additive, transactional and rerunnable; completed legacy durations and original starts remain intact. Review the maintenance rollback in `docs/focus-state.md`; finish/abandon active sessions before downgrading to the old timer. No user records are deleted.

Risks and limits: live Supabase/PostgREST, production migration state, hosted authentication, physical multi-device synchronization and deployment are unverified. Fixture authentication is stubbed. Focus controls refresh eventually, while DB writes are serialized. Expired countdown persistence happens when a client runs/returns; no background worker exists. Break cycles, full Focus Mode UI, day/week time blocking, web task conflict handling and planned/actual date ranges remain in the ordered delivery queue (`docs/v1-audit.md`).

Related: #1 (original MVP umbrella; this PR does not close the full V1 scope).
