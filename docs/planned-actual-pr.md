# Add interval-based planned versus actual review

Intended base: `feat/time-blocking-v1`. Adds database aggregates for day/week/30-day/custom review, separate focus/break totals, task variances, ID-based project/skill allocation, completion/deferral/overdue indicators and truthful empty states. Existing screens stop downloading raw focus history. CSV appends phase/break/link fields while preserving the original five columns.

A trusted trigger records effective intervals across pause/resume. Account-local midnight allocation handles DST and month boundaries. Legacy unrecorded time stays explicitly attributed to its start date; unknown completion dates are never invented. Task rows paginate 50 per report; custom ranges are bounded to 366 days. Unsaved task drafts retain their version snapshot and input through concurrent conflicts.

Migration: `20261025030000_planned_actual.sql`, applied after every preceding migration. Additive, owner RLS, no new AI API/MCP access. Interval writes are restricted to the trigger. Non-destructive rollback is documented in `docs/planned-actual.md`.

Validation: 396 tests across 34 files including every SQL regression; typecheck/lint/build; Chromium complete capture → plan → focus/pause/resume → 90m completion against 60m estimate → +30m review → future adjustment, plus calendar, 390px, conflict and CSV checks. Clock advancement/drop events are automated local fixtures. Real Supabase, production deployment, physical devices and OS sound/notification delivery remain unverified.

Integrated latest main `5a14a30` (phone push, auth trigger hardening and optional Expo source). All four unreleased Focus migration versions now use unique `20261025...` versions after main’s existing migrations. Calendar DST fold interpretation matches existing server reminders; precise day allocation additionally covers midnight jumps/repeats. iOS/Android JS export checks passed locally; signed devices remain unverified.
