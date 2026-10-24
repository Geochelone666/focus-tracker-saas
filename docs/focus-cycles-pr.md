# Focus V1: configurable breaks, bounded cycles and optional alerts

Depends on `feat/focus-state-v1`; intended PR base is that branch until batch 1 is merged. Adds separate focus/short-break/long-break records, bounded configurable cycles, atomic duplicate-safe next-phase startup, optional project/task/skill selection and silent-by-default user-enabled sound/notifications. History/CSV use persisted effective focus duration so pauses and breaks are not credited as work.

Migration: `20261024010000_focus_cycles.sql`, applied after all preceding migrations. Additive and transactional; preserve session records and owner RLS. No new AI/MCP focus permissions. Rollback instructions require finishing active phases and retaining the additive data.

Validation: unit/actions and all migrated SQL suites; typecheck/lint/build; Chromium fixture-backed 25-minute focus + 5-minute break, concurrent starts, pause/resume/reload, stale-device conflict, phase identity, task association and 390px controls. Time is accelerated through test fixtures. Hosted Supabase, production deployment and actual audio/OS notification delivery remain unverified.
