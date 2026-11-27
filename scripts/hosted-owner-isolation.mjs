import { pathToFileURL } from 'node:url';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Explicit inputs only: never load application/admin credentials or create fixtures.
export async function inspectHostedOwners(config, fetcher = fetch) {
  let base;
  try { base = new URL(config.url); } catch { throw new Error('Invalid project URL.'); }
  if (base.protocol !== 'https:' || base.username || base.password ||
      base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Use an HTTPS project origin without credentials, path or query.');
  }
  const { key, accounts } = config;
  let keyRole;
  try { keyRole = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch {}
  if (typeof key === 'string' && (key.startsWith('sb_secret_') || keyRole === 'service_role')) {
    throw new Error('Use a public API key; privileged keys are not accepted.');
  }
  if (typeof key !== 'string' || !key.trim() || !Array.isArray(accounts) || accounts.length !== 2 ||
      accounts.some(a => !a || typeof a.token !== 'string' || !a.token.trim() || !uuid.test(a.taskId)) ||
      accounts[0].token === accounts[1].token || accounts[0].taskId === accounts[1].taskId) {
    throw new Error('Provide a public API key, two distinct session tokens and two distinct task UUIDs.');
  }
  async function read(path, token) {
    try {
      const response = await fetcher(new URL(path, base), {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { apikey: key, Authorization: `Bearer ${token}`, Accept: 'application/json',
          'Accept-Profile': 'public', 'Cache-Control': 'no-store' },
      });
      if (!response.ok) throw new Error();
      return await response.json();
    } catch {
      // Provider bodies, URLs and tokens must never reach receipts or terminal output.
      throw new Error('Hosted read failed. Check connectivity, project configuration and session expiry.');
    }
  }
  const identities = [];
  for (const account of accounts) {
    const user = await read('/auth/v1/user', account.token);
    if (!user || !uuid.test(user.id)) throw new Error('Session did not resolve to a valid authenticated user.');
    identities.push(user.id);
  }
  if (identities[0] === identities[1]) throw new Error('Sessions belong to the same user; two identities are required.');
  for (let i = 0; i < accounts.length; i++) {
    const own = await read(`/rest/v1/schedules?select=id,user_id&id=eq.${accounts[i].taskId}&limit=2`, accounts[i].token);
    if (!Array.isArray(own) || own.length !== 1 || own[0]?.id !== accounts[i].taskId || own[0]?.user_id !== identities[i]) {
      throw new Error('Own-task control failed. Verify each dedicated task exists and belongs to its session.');
    }
    const foreign = await read(`/rest/v1/schedules?select=id,user_id&id=eq.${accounts[1 - i].taskId}&limit=2`, accounts[i].token);
    if (!Array.isArray(foreign) || foreign.length !== 0) {
      throw new Error('Cross-owner task isolation failed. Stop hosted acceptance and investigate RLS.');
    }
  }
  return {
    status: 'PASS', checkedAt: new Date().toISOString(),
    checks: { authenticatedDistinctUsers: 2, ownTaskControls: 2, foreignTaskReadsBlocked: 2 },
    scope: 'Read-only GoTrue identity and schedules SELECT isolation only.',
    remaining: ['Migration reconciliation (#55)', 'Independent contract agreement (#74)',
      'Hosted calendar writes, concurrency and undo', 'Hosted privacy, MFA and email delivery'],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await inspectHostedOwners({
      url: process.env.FOCUS_ACCEPTANCE_URL,
      key: process.env.FOCUS_ACCEPTANCE_PUBLIC_KEY,
      accounts: [1, 2].map(n => ({ token: process.env[`FOCUS_ACCEPTANCE_TOKEN_${n}`],
        taskId: process.env[`FOCUS_ACCEPTANCE_TASK_${n}`] })),
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(JSON.stringify({ status: 'BLOCKED', error: error.message }) + '\n');
    process.exitCode = 1;
  }
}
