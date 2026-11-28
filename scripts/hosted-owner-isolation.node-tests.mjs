import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { inspectHostedOwners } from './hosted-owner-isolation.mjs';

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const tasks = ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const config = () => ({ url: 'https://fixture.invalid', key: 'public-fixture',
  accounts: tasks.map((taskId, i) => ({ taskId, token: `private-token-${i}` })) });
function fixture(change = value => value) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    const i = config().accounts.findIndex(a => options.headers.Authorization === `Bearer ${a.token}`);
    const value = url.pathname === '/auth/v1/user' ? { id: ids[i] }
      : url.searchParams.get('id') === `eq.${tasks[i]}` ? [{ id: tasks[i], user_id: ids[i] }] : [];
    return { ok: true, json: async () => change(value, url, i) };
  };
  return { fetcher, calls };
}

test('checks authenticated identities and both positive/negative controls using only GET', async () => {
  const { fetcher, calls } = fixture();
  const result = await inspectHostedOwners(config(), fetcher);
  assert.equal(result.status, 'PASS');
  assert.equal(calls.length, 6);
  for (const { url, options } of calls) {
    assert.equal(url.origin, 'https://fixture.invalid');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    if (url.pathname.includes('schedules')) {
      assert.equal(url.searchParams.get('select'), 'id,user_id');
      assert.equal(url.searchParams.get('limit'), '2');
    }
  }
  for (const secret of [...ids, ...tasks, 'private-token', 'public-fixture']) {
    assert.ok(!JSON.stringify(result).includes(secret));
  }
  assert.ok(result.remaining.length > 0);
});
test('rejects unsafe origins and incomplete or duplicate controls before network access', async () => {
  for (const url of ['http://fixture.invalid', 'https://user:secret@fixture.invalid',
    'https://fixture.invalid/path', 'https://fixture.invalid/?secret=1', 'https://fixture.invalid/#x', undefined]) {
    await assert.rejects(inspectHostedOwners({ ...config(), url }, () => assert.fail('network called')));
  }
  for (const update of [{ key: '' }, { accounts: [] },
    { accounts: [config().accounts[0], config().accounts[0]] },
    { accounts: [{ ...config().accounts[0], taskId: 'bad&select=*' }, config().accounts[1]] }]) {
    await assert.rejects(inspectHostedOwners({ ...config(), ...update }, () => assert.fail('network called')));
  }
});
test('same identity behind different tokens fails before task reads', async () => {
  const { fetcher, calls } = fixture(value => Array.isArray(value) ? value : { id: ids[0] });
  await assert.rejects(inspectHostedOwners(config(), fetcher), /same user/);
  assert.equal(calls.length, 2);
});
test('recognizable privileged API keys are rejected without network access', async () => {
  const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  for (const key of ['sb_secret_private', `header.${payload}.signature`]) {
    await assert.rejects(inspectHostedOwners({ ...config(), key }, () => assert.fail('network called')), /privileged keys/);
  }
});
test('invalid identity cannot pass', async () => {
  const { fetcher } = fixture(() => ({ id: 'invalid' }));
  await assert.rejects(inspectHostedOwners(config(), fetcher), /authenticated user/);
});
test('empty own control, wrong task or wrong owner cannot create false success', async () => {
  for (const value of [[], [{ id: tasks[1], user_id: ids[0] }], [{ id: tasks[0], user_id: ids[1] }], null]) {
    const { fetcher } = fixture((body, url) => url.pathname.includes('schedules') ? value : body);
    await assert.rejects(inspectHostedOwners(config(), fetcher), /Own-task control failed/);
  }
});
test('foreign task exposure in either direction fails', async () => {
  for (const owner of [0, 1]) {
    const { fetcher } = fixture((body, url, i) => i === owner && url.searchParams.get('id') === `eq.${tasks[1 - i]}`
      ? [{ id: tasks[1 - i], user_id: ids[1 - i] }] : body);
    await assert.rejects(inspectHostedOwners(config(), fetcher), /Cross-owner task isolation failed/);
  }
});
test('malformed foreign response fails closed', async () => {
  const { fetcher } = fixture((body, url) => url.searchParams.get('id') === `eq.${tasks[1]}` ? {} : body);
  await assert.rejects(inspectHostedOwners(config(), fetcher), /Cross-owner task isolation failed/);
});
test('HTTP denial, malformed JSON and transport failures are redacted', async () => {
  for (const fetcher of [async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => { throw new Error('private response'); } }),
    async () => { throw new Error('private-token and private URL'); }]) {
    await assert.rejects(inspectHostedOwners(config(), fetcher), error =>
      error.message.startsWith('Hosted read failed.') && !error.message.includes('private'));
  }
});
test('CLI without configuration exits blocked without printing inherited credentials', () => {
  const result = spawnSync(process.execPath, [new URL('./hosted-owner-isolation.mjs', import.meta.url).pathname], {
    encoding: 'utf8', env: { PATH: process.env.PATH, SUPABASE_SERVICE_ROLE_KEY: 'private-admin' },
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stderr).status, 'BLOCKED');
  assert.ok(!result.stderr.includes('private-admin'));
  assert.equal(result.stdout, '');
});
