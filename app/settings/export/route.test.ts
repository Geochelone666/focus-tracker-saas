import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ rpc: vi.fn(), user: vi.fn() }));
vi.mock('@/supabase/server', () => ({ createClient: async () => ({ rpc: mock.rpc, auth: { getUser: mock.user } }) }));
vi.mock('@/lib/account-export', () => import('../../../lib/account-export'));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error('redirect:' + url); } }));
import { GET } from './route';
const page = { rows: [], next_cursor: null, captured_at: '2026-11-06T05:00:00Z' };
const response = (data: unknown = page, error: unknown = null) => ({ abortSignal: vi.fn().mockResolvedValue({ data, error }) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('FOCUS_DATA_EXPORT_ENABLED', 'true');
  mock.user.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  mock.rpc.mockImplementation(() => response());
});
afterEach(() => vi.unstubAllEnvs());
it('requires the feature and a verified signed-in user', async () => {
  vi.stubEnv('FOCUS_DATA_EXPORT_ENABLED', 'false');
  expect((await GET(new Request('http://localhost/settings/export'))).status).toBe(404);
  expect(mock.rpc).not.toHaveBeenCalled();
  vi.stubEnv('FOCUS_DATA_EXPORT_ENABLED', 'true');
  mock.user.mockResolvedValue({ data: { user: null }, error: null });
  await expect(GET(new Request('http://localhost/settings/export'))).rejects.toThrow('redirect:/login');
  expect(mock.rpc).not.toHaveBeenCalled();
});
it('returns a private download with all collections and a completion marker', async () => {
  const result = await GET(new Request('http://localhost/settings/export?user_id=foreign'));
  expect(result.headers.get('Cache-Control')).toBe('private, no-store');
  expect(result.headers.get('Content-Disposition')).toMatch(/attachment; filename="focus-account-.*\.json"/);
  expect(await result.json()).toMatchObject({ owner_id: 'owner', complete: true, counts: { tasks: 0 } });
  expect(mock.rpc).toHaveBeenCalledWith('account_export_page', { p_collection: 'profile', p_after: null, p_limit: 100 });
});
it('shows retry before starting a failed export and aborts a download on later failure', async () => {
  mock.rpc.mockImplementation(() => response(null, { message: 'private SQL detail' }));
  await expect(GET(new Request('http://localhost/settings/export'))).rejects.toThrow('redirect:/settings/data?error=export');
  mock.rpc.mockImplementationOnce(() => response()).mockImplementation(() => response(null, { message: 'private SQL detail' }));
  const result = await GET(new Request('http://localhost/settings/export'));
  await expect(result.text()).rejects.toThrow('Account export interrupted');
});
it('stops database paging when a user cancels the download', async () => {
  const result = await GET(new Request('http://localhost/settings/export'));
  const reader = result.body!.getReader();
  await reader.read(); await reader.cancel();
  expect(mock.rpc).toHaveBeenCalledTimes(1);
});
it('fails closed if an upstream page has a different owner', async () => {
  mock.rpc.mockImplementation(() => response({ ...page, rows: [{ user_id: 'foreign', note: 'private' }] }));
  await expect(GET(new Request('http://localhost/settings/export'))).rejects.toThrow('redirect:/settings/data?error=export');
});
