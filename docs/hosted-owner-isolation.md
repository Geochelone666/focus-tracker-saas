# Hosted identity and read-isolation check

Run `node scripts/hosted-owner-isolation.mjs` in a trusted terminal after the
intended test project and dedicated accounts have been selected. The script
uses existing GoTrue access tokens; it does not sign in, refresh sessions,
create users or tasks, or perform database writes. It requires no admin key.

Provide these environment variables through a trusted local secret manager or
terminal session. Do not paste tokens into chat, command arguments, repository
files, receipts or CI logs. Disable shell tracing when loading credentials.

| Variable | Value |
| --- | --- |
| `FOCUS_ACCEPTANCE_URL` | Intended project's HTTPS origin |
| `FOCUS_ACCEPTANCE_PUBLIC_KEY` | Project public/publishable API key |
| `FOCUS_ACCEPTANCE_TOKEN_1`, `FOCUS_ACCEPTANCE_TOKEN_2` | Current access tokens for two different dedicated test users |
| `FOCUS_ACCEPTANCE_TASK_1`, `FOCUS_ACCEPTANCE_TASK_2` | UUID of one existing task owned by each respective user |

Each task must exist before the run. Avoid real customer records. For MFA-enabled
accounts, obtain the session through the normal sign-in flow. Expired sessions
produce a blocked result; acquire fresh sessions and rerun.

The six bounded GET requests validate both tokens against `/auth/v1/user`,
require different returned owners, verify each owner can read its own task,
and require the other task to be invisible in both directions. Task queries
select only `id,user_id` and filter a single UUID. Positive controls prevent an
empty table, incorrect task ID or denied own-row read from passing as isolation.
Redirects are rejected and each request has a 15-second timeout.

Success emits a JSON receipt with timestamp and check counts, omitting tokens,
owner IDs, task IDs and provider bodies. Failure exits with code 1 and a
sanitized `BLOCKED` result. Record the tested Git SHA and intended project
reference separately with the receipt, so evidence is tied to the reviewed
environment. A failed foreign-read check requires RLS investigation before
continuing hosted acceptance.

This checks authenticated **SELECT** isolation on `schedules`. It does not
prove write authorization, calendar staging/confirm/undo, concurrent behavior,
other tables, email delivery, MFA challenges or migration parity. Those remain
separate conditions in #55 and #74. A PASS is supporting evidence only.

The offline regression suite uses injected HTTP fixtures and contacts no hosted
project: `node --test scripts/hosted-owner-isolation.node-tests.mjs`.
