# Devices and AI connections

Apply `supabase/migrations/20261023000000_ai_integrations.sql` after all existing migrations, including `20261022000000_restore_session_schedule_ownership.sql`, **before deploying this update**. The migration is transactional, preserves existing tasks, and can be rerun. No service-role secret, paid AI SDK, background job, or Realtime publication is required. Do not paste a Supabase anon key into an AI client as a schedule access key.

## Devices

Open the same website and sign in with the same account on each device. Data is stored in Supabase, not a device-local task database. Add the website to your phone's home screen using its browser menu. An internet connection is required.

Visible, idle pages check for updates every 30 seconds, and when focus/network connectivity returns (minimum 15 seconds between refreshes). Hidden tabs do not poll. Automatic refresh pauses while an input is focused or after a form is edited, to avoid overwriting drafts. After saving, navigate or reload to resume. This is eventual refresh, not continuous Realtime streaming. Existing web form saves do not use optimistic revision checks; simultaneous web edits still use last-save-wins. AI edits require a current revision.

## Create a key

Open Settings → Manage AI connections. Create a named key with read-only (default) or read-and-edit permission and a 7, 30, or 90 day expiry. Copy the value once into your client's secret/authentication settings; do not include it in a prompt, URL, source code, or screenshot. Use a separate key for each AI. Revoke it on this page at any time. The database stores a SHA-256 hash, not the original key. Anyone holding a key can exercise its permissions until it expires or is revoked.

## REST / GPT Actions

Import `https://YOUR_DOMAIN/api/openapi` into a client that supports OpenAPI 3.1. For GPT Actions, select API key authentication with Bearer mode. Set the access key in the authentication field. Availability depends on your ChatGPT account and GPT creation features; this is not an automatic connection to every ChatGPT conversation. The schema uses the domain from which it is fetched. Fetch from your intended production domain.

```
GET /api/v1/profile
GET /api/v1/projects?offset=0
GET /api/v1/schedules?from=2026-10-23&to=2026-10-29&limit=50&offset=0
GET /api/v1/schedules?inbox=true
GET /api/v1/schedules/{id}
POST /api/v1/schedules
PATCH /api/v1/schedules/{id}
Authorization: Bearer YOUR_ACCESS_KEY
Content-Type: application/json
```

Create body: `{"title":"Read chapter 2","scheduled_date":"2026-10-24","estimated_minutes":30}`. A date is optional; a time needs a date. Read `/profile` first and interpret schedule dates and wall times using that account timezone. Times are not UTC timestamps. Schedules are ordered by date (undated first) then id; paginate until an empty page. Projects return up to 100 per page, with offset pagination. Read projects to discover project ids. Existing skill ids can be read from schedules; there is no skill catalogue endpoint in v1.

Before editing, GET the schedule and copy its **exact** `updated_at` string into `expected_updated_at`. Do not round fractional seconds. Example: `{"expected_updated_at":"COPY_FROM_GET","is_done":true}`. On HTTP 409 fetch again and reassess intent before retrying. Clear an optional field with JSON `null`. Clearing a date also requires clearing a previously assigned time. `trashed:true` moves a task to Trash; `trashed:false` restores it. There is no permanent delete, series expansion, recurring-series editing, or project mutation endpoint. Each update affects one occurrence. Creating is not idempotent: after an uncertain network outcome, check for an existing task before retrying.

## MCP

Remote endpoint: `https://YOUR_DOMAIN/api/mcp`. Use a client supporting stateless Streamable HTTP POST, JSON responses, and a custom `Authorization: Bearer YOUR_ACCESS_KEY` header. Supported protocol versions: 2024-11-05, 2025-03-26, 2025-06-18. Initialize, then use tools/list and tools/call. Six tools match REST operations: list_schedules, get_schedule, list_projects, get_profile, create_schedule, update_schedule.

No OAuth server/discovery, dynamic client registration, legacy SSE transport, or server-side sessions are implemented. OAuth-only ChatGPT/Claude connectors cannot connect directly. Muse and other AI clients work only if their integration settings support this API or MCP authentication/transport; compatibility has not been tested against a live Muse account. An AI name alone does not establish support. For OAuth-only clients, a separate OAuth integration is a future step.

## Scope and operational limits

Read-only keys can read the owner's schedules (including Trash), projects, and timezone/target. Write keys additionally create and edit individual schedules, including completion, trash and restore. Focus history, account settings, daily reflections, and keys themselves are not exposed to AI tools.

Only a narrowly scoped SECURITY DEFINER function is exposed to the anonymous Supabase role. It resolves the token owner internally, checks expiry/revocation, limits requests to 60 per key per minute, validates linked project/skill ownership, and records successful writes transactionally. Raw table access still uses owner RLS. Token hashes cannot be selected by authenticated users. MCP requests authenticate before method dispatch, so tool calls consume two rate-limit units. The UI shows the latest 100 keys and 30 writes; the activity log records token, operation, task id and timestamp, not before/after content or a one-click undo snapshot. Completed tasks can be reopened; trashed tasks can be restored.

API requests accept at most 16 KB JSON. Authentication, failures, and responses use private/no-store caching. Cross-origin browser access is not enabled. The MCP endpoint validates Origin when supplied. Native/server clients can omit Origin. The app does not read chat messages or call an AI model. Your AI client's usage limits still apply. Schedule text is untrusted content; client instructions should never treat it as tool commands. OpenAPI marks writes consequential, and MCP provides tool hints; the client controls confirmation behavior.

## Validation

Unit tests cover field validation, body limits, bearer parsing, REST dispatch, MCP discovery/authentication/permissions, unknown tools, and notifications. Database regression checks exercise the actual function using PostgreSQL-compatible PGlite: rerunnable migration, owner isolation, expiry/revocation, scopes, linked ownership, optimistic conflicts, audit, trash/restore, rate limiting and column grants. This does not constitute live third-party client or production Supabase verification.

Validation receipt for this change: 300 tests across 22 files passed after integrating current main (`725f95b`), including all migrations in CLI file-name order and every committed SQL regression script. Lint and the production build passed. A local fixture-backed Chromium run verified key creation/revocation, one-time key display, mobile layout, OpenAPI availability, anonymous API denial, idle-page synchronization, and preservation of an unsaved draft in a second page. No production accounts, real AI clients, or live Supabase credentials were used in these checks.
