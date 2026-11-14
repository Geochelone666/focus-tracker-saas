import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanLocalMigrations, parseRemoteSnapshot, compareInventories, runPreflight } from './migration-drift-preflight.mjs';

const SCRIPT = fileURLToPath(new URL('./migration-drift-preflight.mjs', import.meta.url));

function withInventory(names, callback) {
  const root = mkdtempSync(join(tmpdir(), 'focus-migration-preflight-'));
  const migrationsDir = join(root, 'migrations');
  mkdirSync(migrationsDir);
  for (const name of names) writeFileSync(join(migrationsDir, name + '.sql'), '-- fixture\n');
  try {
    return callback({
      root,
      migrationsDir,
      snapshot(rows, complete = true) {
        const path = join(root, 'snapshot.json');
        writeFileSync(path, JSON.stringify({ complete, migrations: rows }));
        return path;
      }
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('exact version/name parity passes with explicit complete snapshot', () => {
  withInventory(['001_create_focus_sessions', '002_create_skills'], env => {
    const remoteFile = env.snapshot([
      { version: '001', name: 'create_focus_sessions' },
      { version: '002', name: 'create_skills' }
    ]);
    const output = runPreflight({ migrationsDir: env.migrationsDir, remoteFile });
    assert.equal(output.status, 'PASS');
    assert.equal(output.localCount, 2);
    assert.equal(output.remoteCount, 2);
    assert.deepEqual(output.findings, []);
  });
});

test('local-only checks file versions without claiming remote parity', () => {
  withInventory(['001_create_focus_sessions'], env => {
    const output = runPreflight({ migrationsDir: env.migrationsDir, localOnly: true });
    assert.equal(output.status, 'LOCAL_ONLY');
    assert.equal(output.remoteCount, null);
  });
});

test('issue #55: all six Focus V1 generated IDs and earlier ownership migration block', () => {
  const localNames = [
    '20260930002658_enforce_session_skill_ownership',
    '20261025000000_focus_state',
    '20261025010000_focus_cycles',
    '20261025020000_time_blocks',
    '20261025030000_planned_actual',
    '20261025040000_remove_duplicate_schedule_index',
    '20261025050000_cache_auth_identity_in_owner_rls'
  ];
  const remote = [
    { version: '20260930003353', name: 'enforce_session_skill_ownership' },
    { version: '20261025044752', name: 'focus_v1_20261025000000_state' },
    { version: '20261025044805', name: 'focus_v1_20261025010000_cycles' },
    { version: '20261025044816', name: 'focus_v1_20261025020000_time_blocks' },
    { version: '20261025044829', name: 'focus_v1_20261025030000_planned_actual' },
    { version: '20261025045528', name: 'focus_v1_20261025040000_remove_duplicate_schedule_index' },
    { version: '20261025114225', name: 'focus_v1_20261025050000_cache_auth_identity_rls' }
  ];
  withInventory(localNames, env => {
    const result = runPreflight({ migrationsDir: env.migrationsDir, remoteFile: env.snapshot(remote) });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.findings.filter(item => item.code === 'VERSION_MISMATCH').length, 7);
    assert.equal(result.findings.some(item => item.localVersion === '20260930002658'), true);
    assert.equal(result.findings.some(item => item.localVersion === '20261025020000' &&
      item.remoteVersion === '20261025044816'), true);
  });
});

test('unexpected remote-only/local-only versions are both reported', () => {
  const result = compareInventories(
    [{ version: '001', name: 'one' }],
    [{ version: '009', name: 'unrecognized' }]
  );
  assert.deepEqual(result.findings.map(x => x.code).sort(), ['LOCAL_ONLY', 'REMOTE_ONLY']);
  assert.equal(result.status, 'BLOCKED');
});

test('same version but different name is not considered a match', () => {
  const result = compareInventories(
    [{ version: '001', name: 'one' }],
    [{ version: '001', name: 'two' }]
  );
  assert.deepEqual(result.findings.map(x => x.code), ['NAME_MISMATCH']);
});

test('duplicate local versions, even with different filenames, block', () => {
  withInventory(['001_one', '001_two'], env => {
    const report = scanLocalMigrations(env.migrationsDir);
    assert.ok(report.findings.some(item => item.code === 'DUPLICATE_LOCAL_VERSION'));
    assert.equal(runPreflight({ migrationsDir: env.migrationsDir, localOnly: true }).status, 'BLOCKED');
  });
});

test('duplicate remote versions block and do not silently deduplicate', () => {
  const local = [{ version: '001', name: 'one' }];
  const remote = [{ version: '001', name: 'one' }, { version: '001', name: 'one' }];
  assert.equal(compareInventories(local, remote).findings[0].code, 'DUPLICATE_REMOTE_VERSION');
});

test('ambiguous legacy aliases cannot be guessed', () => {
  const local = [{ version: '20261025000000', name: 'same' },
    { version: '20261025010000', name: 'same' }];
  const remote = [{ version: '20261025099999', name: 'same' }];
  const result = compareInventories(local, remote);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.findings.some(item => item.code === 'AMBIGUOUS_ALIAS'));
});

test('invalid names are rejected without reporting contents', () => {
  withInventory(['001_valid', '002_INVALID'], env => {
    const result = scanLocalMigrations(env.migrationsDir);
    assert.deepEqual(result.findings, [{ code: 'INVALID_LOCAL_FILENAME' }]);
  });
  assert.throws(() => parseRemoteSnapshot(JSON.stringify({
    complete: true, migrations: [{ version: '001', name: 'secret@example.com' }]
  })), { code: 'INVALID_SNAPSHOT' });
});

test('malformed, incomplete, empty, extra-field inventories are blocked', () => {
  assert.throws(() => parseRemoteSnapshot('{'), { code: 'INVALID_SNAPSHOT' });
  assert.throws(() => parseRemoteSnapshot('{"complete":false,"migrations":[]}'), { code: 'INCOMPLETE_INVENTORY' });
  assert.throws(() => parseRemoteSnapshot('{"complete":true,"migrations":[]}'), { code: 'INCOMPLETE_INVENTORY' });
  assert.throws(() => parseRemoteSnapshot(JSON.stringify({
    complete: true, migrations: [{ version: '001', name: 'one', secret: 'never-log' }]
  })), { code: 'INVALID_SNAPSHOT' });
});

test('CLI JSON outputs stable exit codes, never requires connectivity', () => {
  withInventory(['001_one'], env => {
    const parity = env.snapshot([{ version: '001', name: 'one' }]);
    const run = (...args) => spawnSync(process.execPath, [SCRIPT, '--migrations-dir', env.migrationsDir,
      '--format', 'json', ...args], { encoding: 'utf8' });
    const exact = run('--remote', parity);
    assert.equal(exact.status, 0, exact.stderr);
    assert.equal(JSON.parse(exact.stdout).status, 'PASS');
    const local = run('--local-only');
    assert.equal(local.status, 0, local.stderr);
    assert.equal(JSON.parse(local.stdout).status, 'LOCAL_ONLY');
    const drift = run('--remote', env.snapshot([{ version: '003', name: 'other' }]));
    assert.equal(drift.status, 1, drift.stderr);
    assert.equal(JSON.parse(drift.stdout).status, 'BLOCKED');
    const invalid = run('--remote', env.snapshot([], false));
    assert.equal(invalid.status, 2);
    assert.equal(JSON.parse(invalid.stdout).code, 'INCOMPLETE_INVENTORY');
    const missing = run();
    assert.equal(missing.status, 2);
    assert.equal(JSON.parse(missing.stdout).code, 'INVALID_ARGUMENTS');
  });
});

test('unreadable local directory and missing snapshot are handled safely', () => {
  assert.throws(() => scanLocalMigrations('/path/that/does/not/exist'), { code: 'LOCAL_READ_ERROR' });
  withInventory(['001_one'], env => {
    assert.throws(() => runPreflight({ migrationsDir: env.migrationsDir,
      remoteFile: resolve(env.root, 'absent.json') }), { code: 'SNAPSHOT_READ_ERROR' });
  });
});
