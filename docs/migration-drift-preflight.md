# Migration drift preflight (offline / read-only)

This is the pre-deployment safety check requested in [#62](https://github.com/Geochelone666/focus-tracker-saas/issues/62) for the known production history mismatch in [#55](https://github.com/Geochelone666/focus-tracker-saas/issues/55). It detects suspicious differences; it **does not repair, reconcile, connect to, or verify** a hosted database.

## Run without any remote credentials

From the repository root, with Node.js 22 or 24:

\`\`\`sh
node scripts/migration-drift-preflight.mjs --local-only
node --test scripts/migration-drift-preflight.test.mjs
\`\`\`

Local-only checks SQL migration filename format, duplicate versions and an empty directory. A passing result says **LOCAL_ONLY**, not that production is in sync. CI runs both commands without network access, credentials, database clients, or changes to SQL files.

For a manually exported **complete, sanitized** remote migration registry inventory, create a local JSON file (outside Git and preferably outside the repository):

\`\`\`json
{
  "complete": true,
  "migrations": [
    { "version": "001", "name": "create_focus_sessions" },
    { "version": "002", "name": "create_skills" }
  ]
}
\`\`\`

This is an illustrative subset, **not** a complete inventory of the real Focus database. The script requires the complete applied registry, including legacy hand-applied entries, for any parity claim. Do not copy this example as a real inventory.

\`\`\`sh
node scripts/migration-drift-preflight.mjs --remote /path/to/sanitized-inventory.json
node scripts/migration-drift-preflight.mjs --remote /path/to/sanitized-inventory.json --format json
\`\`\`

The input schema allows only \`complete\` and \`migrations\` at the root and only \`version\` / \`name\` per row. No credentials, SQL bodies, connection strings, emails, tokens, object descriptions, timestamps, or other fields. A snapshot with unknown fields, invalid characters, duplicates, missing rows, or \`complete: false\` is blocked. Do **not** commit real snapshots or secrets. Do not send one to a public CI job. Only the local-only mode runs in CI.

## Exit codes and meaning

| Exit | Status | Meaning |
| --- | --- | --- |
| 0 | LOCAL_ONLY | Local naming is valid; **remote was not checked** |
| 0 | PASS | Complete supplied snapshot has exact version/name parity; live SQL effects are **not** checked |
| 1 | BLOCKED | Drift or ambiguous inventory: **stop deployment and review** |
| 2 | BLOCKED | Missing, unreadable, incomplete or malformed input: **stop deployment and review** |

Diagnostic codes are \`VERSION_MISMATCH\`, \`NAME_MISMATCH\`, \`LOCAL_ONLY\`, \`REMOTE_ONLY\`, \`AMBIGUOUS_ALIAS\`, \`DUPLICATE_LOCAL_VERSION\`, \`DUPLICATE_REMOTE_VERSION\`, \`INVALID_LOCAL_FILENAME\`, \`EMPTY_LOCAL_INVENTORY\`, \`INVALID_SNAPSHOT\`, \`INCOMPLETE_INVENTORY\`, \`LOCAL_READ_ERROR\` and \`SNAPSHOT_READ_ERROR\`. JSON output contains only sanitized migration metadata, counts and codes. A remote name that matches a local name or embeds a local timestamp is a *suspected* alias, never evidence that migration SQL was applied.

The regression suite covers the six Focus V1 alias examples in #55 and a pre-V1 owner-policy migration with a changed remote version. It also covers exact parity, unexpected versions, duplicate identifiers, ambiguous names, malformed/incomplete input and CLI exit codes.

## Mandatory pre-release procedure (separate authorization)

1. Freeze the exact proposed application SHA and migration set. Verify branch CI: web lint, types, unit/SQL migration suite, build, fixture-backed E2E and applicable native compatibility checks.
2. A trusted operator reads the intended project's **complete** applied migration registry using a documented **read-only** method (e.g. inspect \`supabase migration list\` and, with authorized SQL metadata read permission, \`SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version\`). Confirm the export is complete, sanitized and corresponds to the intended environment. Never export secrets or execute SQL test fixtures against production.
3. On a trusted offline machine, compare that exported registry with the same commit's migration folder via \`--remote\`. Treat every non-PASS result as a block. Review all prior filenames, not only the six Focus V1 entries.
4. Even when the snapshot matches, independently verify actual columns, functions, policies, grants and migration effects. Exact names do not prove schema parity; a historical registry mismatch can reflect already-applied SQL.
5. If drift remains, follow the **separately reviewed** recovery process in #55. Back up and reconcile all versions first; do **not** automatically \`supabase db push\`, \`supabase migration repair\`, \`supabase db reset\`, edit the remote registry, or replay an already-applied migration. Rehearse any proposed procedure against a disposable environment.
6. Release only with explicit approval after environment, authentication, owner RLS, rollback compatibility, and production CI gating are independently checked. Verify the actual deployed SHA and smoke-test a disposable account after deployment.

**Stop condition:** Without a complete recent snapshot and manual schema evidence, the output is useful for diagnosing risk but **never** authorizes production migration or release. This script does not open a network connection and cannot certify live state.
