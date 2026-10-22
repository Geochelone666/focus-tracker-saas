import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), signIn: vi.fn(), signUp: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/auth-errors', () => import('../../lib/auth-errors'));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error('Redirect: ' + url); } }));
import { login, signup } from './actions';
function form() {
  const data = new FormData();
  data.set('email', ' person@example.com ');
  data.set('password', ' secret password ');
  return data;
}
describe('authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { signInWithPassword: mocks.signIn, signUp: mocks.signUp } });
    mocks.signIn.mockResolvedValue({ error: null });
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
  });
  it('preserves password whitespace while trimming the email', async () => {
    await expect(login(form())).rejects.toThrow('Redirect: /today');
    expect(mocks.signIn).toHaveBeenCalledWith({ email: 'person@example.com', password: ' secret password ' });
  });
  it('explains email confirmation when signup has no session', async () => {
    await expect(signup(form())).rejects.toThrow('Redirect: /login?message=' + encodeURIComponent('Check your email to confirm your account, then log in.'));
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('opens Today for a signup with an active session', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: 'test' } }, error: null });
    await expect(signup(form())).rejects.toThrow('Redirect: /today');
  });
  it('rejects empty credentials', async () => {
    await expect(login(new FormData())).rejects.toThrow('Redirect: /login?message=');
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it('replaces network failures with an actionable message', async () => {
    const unavailable = 'Redirect: /login?message=' + encodeURIComponent("Couldn't reach the sign-in service. Check your connection and try again.");
    mocks.signIn.mockResolvedValue({ error: { name: 'AuthRetryableFetchError', message: 'fetch failed', status: 0 } });
    await expect(login(form())).rejects.toThrow(unavailable);
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: { name: 'AuthApiError', message: 'Internal error', status: 503 } });
    await expect(signup(form())).rejects.toThrow(unavailable);
  });
  it('keeps ordinary auth errors as-is', async () => {
    mocks.signIn.mockResolvedValue({ error: { name: 'AuthApiError', message: 'Invalid login credentials', status: 400 } });
    await expect(login(form())).rejects.toThrow('Redirect: /login?message=' + encodeURIComponent('Invalid login credentials'));
  });
});
