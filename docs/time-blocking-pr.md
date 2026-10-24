# Add day/week time blocking and versioned task saves

Intended base: `feat/focus-cycles-v1`. Reuses task date/time/estimate for a 24-hour day/week timeline, Inbox drag/drop, movement, resizing, overlap warnings and an equivalent mobile/keyboard editor. Adds a separate deadline field. Month view and existing recurrence rules remain available.

All web task changes use the owner-scoped `mutate_schedule` RPC with exact root and future-occurrence revisions. Concurrent stale edits fail rather than silently overwriting; completed recurring records remain intact. No AI/MCP scope is broadened.

Migration: `20261025020000_time_blocks.sql`, additive and transactional, after all previous migrations. Retain data/columns on rollback; see `docs/time-blocking.md`. Legacy direct actions now require revisions.

Validation: all unit/action/SQL suites, typecheck/lint/build; Chromium capture/schedule/reload/drag/resize/deadline/Inbox/mobile checks. DST gaps/folds and overnight blocks are covered locally. Live Supabase, real devices and production deployment remain unverified.
