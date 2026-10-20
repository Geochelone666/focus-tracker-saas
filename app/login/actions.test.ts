import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), signIn: vi.fn(), signUp: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/supabase/server', () => ({ createClient: mocks.createClient }));
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
    await expect(login(form())).rejects.toThrow('Redirect: /dashboard');
    expect(mocks.signIn).toHaveBeenCalledWith({ email: 'person@example.com', password: ' secret password ' });
  });
  it('explains email confirmation when signup has no session', async () => {
    await expect(signup(form())).rejects.toThrow('Redirect: /login?message=' + encodeURIComponent('Check your email to confirm your account, then log in.'));
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('opens the dashboard for a signup with an active session', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: 'test' } }, error: null });
    await expect(signup(form())).rejects.toThrow('Redirect: /dashboard');
  });
  it('rejects empty credentials', async () => {
    await expect(login(new FormData())).rejects.toThrow('Redirect: /login?message=');
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
