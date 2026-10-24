# Focus state V1 — batch 1

Apply `supabase/migrations/20261024000000_focus_state.sql` after **all** earlier migrations, including `20261023000000_ai_integrations.sql`, before deploying the application. Apply migrations in filename order. Do not edit or reapply only the old policy migrations. Use a test project first; review and apply production migrations separately with authorization.

The additive, transactional migration preserves legacy ids, timestamps, links, notes and `duration_sec`. Legacy open sessions become running count-up sessions, using their original start; completed sessions keep their durations. The existing unique partial index still covers both running and paused rows because both have `ended_at IS NULL`. Deployment does not auto-close old sessions; review/finish or abandon them explicitly.

`focus_mode`, `target_seconds`, `focus_status`, `accumulated_ms`, `resumed_at` and `focus_revision` describe a recoverable state. Accumulation keeps millisecond fragments until completion. The database trigger uses `clock_timestamp()` for transitions; UI ticks never persist time. Paused time is excluded, countdown time capped, and `duration_sec` remains the backward-compatible completed-focus total. Abandoned sessions remain in history with zero credited duration. Breaks are not implemented and are never folded into focus totals.

`transition_focus` locks the owner's row, applies RLS as SECURITY INVOKER, checks the expected revision and returns a conflict on stale intent. Repeating the already-applied action returns the first result without changing time or notes. Both terminal states reject resurrection. Direct legacy stops also receive DB accounting; legacy recovery no longer deletes rows or rewrites starts. No AI token/API/MCP scope, service-role requirement or public focus RPC permission is added. Existing focus delete grants are unchanged; no new UI uses deletion.

Dashboard and task cards offer count-up or countdown (25/45/60 suggestions and custom 1–1440 minutes). Today and Dashboard share pause, resume, finish, note and abandon controls. An expired countdown submits at most once per mounted session revision; retries use the visible save control. The DB independently makes duplicate completion harmless. Hidden tabs may defer saving until foregrounded, but can never earn time after the target. Notes can be entered before finishing/expiry; a post-completion outcome editor belongs to batch 2. No audio is played and no focus notification permission is requested.

## Checks

```
npm ci
npm test
npm run typecheck
npm run lint
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy-anon-key npm run build
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium node scripts/e2e-focus.mjs
```

`e2e-focus.mjs` starts its own Next production server on 3100 and a loopback Supabase-protocol fixture on 54329. Set `FOCUS_APP_PORT` / `FOCUS_FIXTURE_PORT` if needed. Use Playwright's installed Chromium by omitting the executable override. The fixture uses actual migrated PGlite, owner RLS and the real transition function, plus stubbed authentication and a limited REST adapter. It is not a replacement for PostgREST/GoTrue/Supabase integration tests. Test-only timestamp backdating accelerates elapsed time; it is never part of application startup or production code. The ten-minute pause browser-clock check is simulated, not a ten-minute wall-clock soak.

Run the existing auth guard E2E with the documented unreachable Supabase server as well. `npm test` applies every migration in filename order, runs `supabase/tests/focus_state.sql` and all earlier SQL suites, and tests legacy-history upgrade and repeatability. SQL scripts require two dedicated test accounts and rollback their fixtures; the focus suite refuses to run if its test owner already has an active session.

## Rollback

Prefer rolling the application forward. Before downgrading to the original timer, finish or abandon **all active sessions** using the new UI; the old app does not understand paused time. Back up the database. Then, in a maintenance transaction, verify no rows have `ended_at IS NULL`, drop trigger `focus_state_guard` on `public.focus_sessions`, drop `public.transition_focus(uuid,integer,text,text,uuid)` and `public.guard_focus_state()`, and deploy the old app. Retain the additive columns and their data; do not drop user records or recalculate completed history. A regression test rehearses this non-destructive rollback. Reapplying the forward migration reinstalls the functions and trigger. An application-only rollback with active paused sessions is unsafe.

Hosted verification still required: real email authentication, real PostgREST error mapping, refresh/background on phone and desktop, simultaneous devices, migration upgrade on a copy of production, exact RLS/anon permissions, and actual focus + break after batch 2. No live Supabase or production changes are made by these checks.

## Batch 2 — breaks and cycles

Apply `20261024010000_focus_cycles.sql` after the state migration. Each focus/short-break/long-break is a retained row with its own state, timestamps and expected revision. The existing partial unique index includes breaks, so paused breaks also prevent concurrent focus. `previous_session_id` is unique and `next_focus_phase` locks its owner-scoped predecessor, preventing duplicate next phases. Start each phase explicitly; completion never silently starts another timer. Configure 1–12 rounds, short and long breaks and the long-break cadence before starting. The Focus screen also accepts optional task/project/skill links; project identity is snapshotted on new sessions. Legacy project identity can only be inferred from the task at upgrade time.

Completed focus remains in `duration_sec`; completed breaks use `break_duration_sec` and contribute zero focus. History and CSV now use effective focus duration rather than wall-clock subtraction. Sound and browser notifications are off by default. Sound requires enabling an AudioContext through a user gesture in the current session; notifications require an explicit permission request. Both can be disabled immediately. Unsupported/denied browser capabilities leave timers usable.

For rollback, finish/abandon every active phase first. Drop `next_focus_phase(uuid)` and reinstall the preceding state guard from the prior migration, retaining all additive columns and rows. Do not drop breaks or recalculate historical totals. Apply and test the forward migrations again before re-enabling cycles. Hosted checks remain unverified.
