import { beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ rpc: vi.fn(), context: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/planning-data', () => ({ planningContext: mock.context }));
vi.mock('next/cache', () => ({ revalidatePath: mock.revalidate }));
import { revokeConnections } from './actions';

beforeEach(() => {
  vi.resetAllMocks();
  mock.context.mockResolvedValue({ supabase: { rpc: mock.rpc }, user: { id: 'owner' } });
  mock.rpc.mockResolvedValue({ data: { revoked_keys: 1, paused_devices: 1 }, error: null });
});
const confirmation = () => {
  const form = new FormData();
  form.set('confirm', 'revoke');
  form.set('user_id', 'foreign');
  return form;
};
it('requires explicit confirmation and uses authenticated context without accepting an owner', async () => {
  expect(await revokeConnections({}, new FormData())).toHaveProperty('error');
  expect(mock.context).not.toHaveBeenCalled();
  expect(await revokeConnections({}, confirmation())).toHaveProperty('success');
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith('revoke_account_connections');
  expect(mock.revalidate).toHaveBeenCalledWith('/settings/integrations');
  expect(mock.revalidate).toHaveBeenCalledWith('/settings/notifications');
});
it('requires authentication before revocation', async () => {
  mock.context.mockRejectedValue(new Error('redirect:/login'));
  await expect(revokeConnections({}, confirmation())).rejects.toThrow('redirect:/login');
  expect(mock.rpc).not.toHaveBeenCalled();
});
it('keeps failures retryable without exposing database details', async () => {
  mock.rpc.mockResolvedValueOnce({ error: { message: 'private SQL detail' } });
  const failed = await revokeConnections({}, confirmation());
  expect(failed.error).toMatch(/Retry/);
  expect(failed.error).not.toContain('private');
  expect(mock.revalidate).not.toHaveBeenCalled();
  mock.rpc.mockRejectedValueOnce(new Error('network'));
  expect(await revokeConnections({}, confirmation())).toHaveProperty('error');
  expect(await revokeConnections({}, confirmation())).toHaveProperty('success');
});
