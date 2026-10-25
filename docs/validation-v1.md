# Focus Track V1 validation receipt

Web workflow implemented in four stacked branches, integrated with main `5a14a30` (phone reminders, auth trigger hardening and optional Expo source). No production migrations, environment variables, credentials or service permissions were changed. The user subsequently authorized merging; all four batches are included in main at `991cceb903adf4bd0de32993d3589be5feb0c205`.

## Verified locally

- `npm test`: **396 passed, 34 files**, including all filename-ordered SQL suites, migration version uniqueness, legacy history upgrade, rerun/rollback, session/cycle uniqueness, interval ownership and trigger-only writes, recurrence conflicts, DST midnight skips/repeats and 60m/90m variance.
- `npm run typecheck`: passed.
- `npm run lint`: passed with no ESLint findings. Next 15's command-deprecation notice remains upstream.
- `npm run build`: passed with the documented unreachable Supabase test values.
- `scripts/e2e-auth.mjs`: **12 protected routes** redirect, forged cookie rejected, form validation, readable unreachable-auth message and 390px layout. The runner waits for streamed client redirects.
- `scripts/e2e-focus.mjs`: real Next Server Actions plus a migrated PGlite database and a limited Supabase protocol fixture. Concurrent starts; pause/reload; simulated ten-minute pause; stale focus conflict; outcome/skill persistence; once-only 25m countdown; separate 5m break; task start/abandon; Inbox capture; 14:00–15:30 time block; persisted move/resize; deadline preservation; stale task conflict with input retained; mobile day/week editing; Inbox return; exact 90m actual against 60m planned; +30m variance and 66.7% fit; 7/30/custom review; CSV export; future-plan adjustment.
- Existing optional native source: `cd mobile && npm run typecheck`, offline `npm run check`, and `npm run export:check` passed for iOS/Android JavaScript bundles. Offline dependency validation and JS export do not establish signed/native-device release readiness; upstream advisory tracking remains in issue #38.

The full workflow runner uses accelerated test timestamps and synthetic drop events. Authentication/HTTP transport are fixtures, while SQL/RLS/actions run real code. The browser-clock simulation is isolated in a page that is closed before subsequent framework scheduling. The regression assertions remain active. Loading UI is scoped to the read-only review route; saves have independent pending/error feedback.

Mobile screenshots are produced by the runner at `/tmp/focus-v1-calendar-390.png` and `/tmp/focus-v1-review-390.png`. These contain disposable fixture data. Week columns scroll within the calendar; task editing remains available above the grid.

## Migration order

After every existing main migration, including push/security changes:

1. `20261025000000_focus_state.sql`
2. `20261025010000_focus_cycles.sql`
3. `20261025020000_time_blocks.sql`
4. `20261025030000_planned_actual.sql`

These are unreleased additive migrations. Their versions were changed before release to avoid collisions with newly published main migration versions. Completed legacy focus durations remain intact; unknown interval/completion history is explicitly labelled, not invented. Review individual deployment/rollback instructions before applying to a copied test project, then separately approve a production rollout.

## Review and external acceptance

PRs #48–51 are merged following explicit user authorization. #48 merged into main; #49 merged into the batch-1 branch; #50 brought the batch-2 and batch-3 changes into main; #51 brought analytics into main. The resulting main tree is identical to the validated #51 head `9d41d61`. Main CI is checked separately from the previously successful PR checks. CI and Vercel deployment status do not establish authenticated hosted application behavior.

Still unverified: real Supabase/GoTrue/PostgREST, hosted migrations and ownership policies, real email login, physical phone/desktop consistency, OS sound/notification delivery and production behavior. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are absent from this runtime and no `.env.local` exists. A dedicated test project, migrations and usable test accounts are required to continue those checks; provide credentials through secure environment settings, never chat. Existing proxy authentication is sufficient for GitHub PR creation.
