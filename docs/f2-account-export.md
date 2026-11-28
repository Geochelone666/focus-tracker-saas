# Account data export

This independent Phase 6A increment is stacked on `feat/f2-authoritative-work-hours`.
`FOCUS_DATA_EXPORT_ENABLED` defaults off. It does not clear the outstanding
Smart Calendar, hosted migration or production release gates.

## User workflow

Settings → **Download your data** → **Download account JSON** starts a normal
browser download. The existing focus CSV remains available. The page explains
that concurrent changes may not all be included and that the file contains
private task text and notes. Initial read failures return to a retry message;
interrupted downloads are reported as failures by the browser.

The export includes 15 collections: profile, skills, projects (including goal
names/target dates), tasks (including completed/Trash/recurrence links and recovery
context), focus sessions, focus segments, daily reflections, calendar state/drafts/
receipts/locks, work preferences, AI connection metadata/activity and notification
device settings. It includes IDs needed to correlate records and the account's
IANA timezone. Active timers are exported as their persisted state, without
inventing completed durations or changing the running session.

Excluded: auth credentials/sessions, API key values/hashes, push tokens/endpoints/
subscription keys and notification delivery internals. Browser-only preferences
such as the local theme are not account records and are listed as excluded.
This is a versioned data download, not a database restore or account-deletion tool.

## Format and consistency

The JSON format is `focus-account/v1`. Metadata includes the verified owner,
start/finish instants, included collections and exclusions. `data` contains one
array per collection, followed by counts, first/last page read timestamps and
`complete: true`. PostgreSQL bigint values are decimal strings to preserve values
above JavaScript's safe integer limit. UTC instants retain database precision;
local date/time fields retain their original values.

Every SQL page is a statement-consistent read. Different pages/collections are
read independently, not as a single transaction snapshot. Concurrent insertions
with keys behind the cursor, deletions and updates can make the combined export
incomplete or mutually inconsistent. The file and UI explicitly disclose this;
users should finish editing on other devices before requesting a consistent copy.
There is no claim that a captured timestamp freezes account data.

A failed download never receives the final completion marker. After streaming
starts, the server aborts on errors rather than emitting a successful partial
file or embedding SQL error details. A consumer should require valid JSON and
`complete === true`. The browser's interrupted-download indication is part of
normal user feedback. A successful HTTP status alone is insufficient evidence of
completion when consuming this streaming endpoint programmatically.

## Security and resource limits

`account_export_page(collection, after, limit)` is SECURITY INVOKER with a fixed
collection/column allowlist. It accepts no owner ID: every page filters by
`auth.uid()` and uses the existing table RLS/column grants. Anonymous access is
revoked. No service-role key or additional AI/MCP capability is introduced. The
route verifies the logged-in user and also rejects any returned row with another
owner. Request query parameters cannot select a different account.

Each page contains at most 100 records, ordered by an immutable primary key.
UUID/date/bigint cursors use the database's native ordering. SQL identifiers and
projections come only from constants; cursor and owner values use bound parameters.
New table columns are not automatically included, protecting future sensitive
fields. Owner/key indexes support growing histories. The application keeps only
bounded pages in memory, although individual legacy free-text values may be large.

The route uses native streaming/backpressure, a 50-second request read budget and
`maxDuration = 60`; cancellation aborts outstanding reads. Large accounts that
cannot finish within the platform limit receive a failed download, not a silently
truncated success. Resumable export jobs are a later scaling option if real usage
requires them; no queue/storage service is introduced here. Responses are private,
non-cacheable JSON attachments with `nosniff`.

## Deployment and rollback

**Pagination correction (2026-11-11):** apply
`20261106030000_account_export_order.sql` after the original export migration
before enabling account downloads. This brings the local migration count to 37.
The original function sorted `focus_segments.id` by its serialized text alias
while using a numeric cursor; multi-page exports could omit records and still
contain `complete: true`. That marker indicates the stream finished, not that
the old pagination implementation was correct. Regenerate any affected prior
downloads after applying the fix. The correction sorts by the native `_sort`
key and preserves decimal-string IDs in the file. It replaces only the RPC,
retains existing permissions and does not modify user records. Keep this fix
when rolling back application changes; do not restore the faulty RPC.

Correction verified locally on 2026-11-11: the old function returns only 196 of
206 fixture IDs; the same regression passes after the fix with page sizes 100
and 7. The full 583-test suite, typecheck, lint, build and PostgreSQL 17 runner
passed with all 37 migrations. Chromium downloaded the actual JSON and matched
every segment ID against database numeric order, including an ID above
JavaScript's safe integer range. Existing daily/Smart Calendar/recovery workflows
also passed. This does not verify a hosted deployment.

Apply `20261106020000_account_export.sql` after existing migrations (36 local
files), once hosted registry/schema reconciliation has been completed. It adds
one read-only RPC and owner/key indexes; no user records are rewritten. Large
hosted tables may require a separately reviewed index rollout based on actual
sizes and lock budgets. Local tests do not measure production migration time.

Deploy the application and enable the server-only `FOCUS_DATA_EXPORT_ENABLED=true`
in the intended test environment. Verify two real accounts and a real browser
download before release. Disable the flag and revert the app for rollback; retain
user records and optional indexes. If removing the RPC in a reviewed environment,
use `drop function public.account_export_page(text,text,integer)` after disabling
the route. No data deletion is required.

## Verification

- Unit/route tests: paging, valid streamed JSON, escaping, exact bigint strings,
  missing completion on failure, cancellation, disabled/anonymous requests,
  private headers, owner mismatch and retry behavior.
- SQL: every collection under owner RLS, foreign isolation, Trash/context,
  fixed projections after adding a simulated future secret column, token/push
  credential exclusion, invalid collection/cursor/page bounds, exact IDs/instants.
- Disposable PostgreSQL 17 applies all migrations and executes this SQL regression
  alongside the existing two-connection calendar races and rollback checks.
- Chromium fixture: Settings entry, initial failure/retry, native file download,
  more than 100 tasks without duplicates, focus/break/recovery/work preferences,
  credential exclusion and 390px layout. Existing CSV and daily workflows remain
  covered. Auth-guard E2E includes the new pages/download route.

Fixture authentication and SQL test identities do not verify real GoTrue accounts,
hosted Supabase policy behavior, Vercel streaming limits, actual phones or
production readiness. Those gates remain listed in the roadmap status.

Local verification on 2026-11-06: **583 tests / 55 files passed**, plus typecheck,
lint (no findings), production build, all 36 migrations and SQL regressions in
disposable PostgreSQL 17, existing observed calendar races, the full Chromium
daily workflow with native account download, and auth-guard E2E (14 protected
routes). The 390px export screenshot was inspected. Offline migration filename
preflight has no findings; it does not establish hosted registry alignment.
