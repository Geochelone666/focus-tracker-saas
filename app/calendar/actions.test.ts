import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), revalidatePath: vi.fn(), insert: vi.fn(), update: vi.fn(), eq: vi.fn(), getUser: vi.fn() }));
vi.mock('@/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/calendar', () => import('../../lib/calendar'));
vi.mock('@/lib/validation', () => import('../../lib/validation'));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error('Redirect: ' + url); } }));
import { addSchedule, toggleSchedule } from './actions';
const id = '11111111-1111-4111-8111-111111111111';
function form() { const data = new FormData(); data.set('title', '周会'); data.set('scheduled_date', '2026-10-20'); return data; }
describe('schedule actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.eq.mockReturnValueOnce({ eq: mocks.eq }).mockResolvedValue({ error: null });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: () => ({ insert: mocks.insert, update: mocks.update }) });
  });
  it('creates the schedule for the authenticated user and selects its date', async () => {
    await expect(addSchedule(form())).rejects.toThrow('Redirect: /calendar?date=2026-10-20');
    expect(mocks.insert).toHaveBeenCalledWith({ title: '周会', scheduled_date: '2026-10-20', scheduled_time: null, notes: null, user_id: 'owner' });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/calendar');
  });
  it.each([true, false])('sets completed to %s and scopes updates to the owner', async done => {
    await toggleSchedule(id, done);
    expect(mocks.update).toHaveBeenCalledWith({ is_done: done });
    expect(mocks.eq).toHaveBeenNthCalledWith(1, 'id', id);
    expect(mocks.eq).toHaveBeenNthCalledWith(2, 'user_id', 'owner');
  });
  it('rejects invalid inputs before database access', async () => {
    await expect(addSchedule(new FormData())).rejects.toThrow('Redirect: /calendar?error=');
    await expect(toggleSchedule('bad', true)).rejects.toThrow('Redirect: /calendar?error=');
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it('prevents unauthenticated writes', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(addSchedule(form())).rejects.toThrow('Redirect: /login');
    await expect(toggleSchedule(id, true)).rejects.toThrow('Redirect: /login');
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('reports save failure without claiming success', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'unavailable' } });
    await expect(addSchedule(form())).rejects.toThrow('Redirect: /calendar?error=');
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
