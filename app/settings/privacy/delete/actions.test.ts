import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  sessionClient: vi.fn(), newClient: vi.fn(), getUser: vi.fn(), assurance: vi.fn(),
  verify: vi.fn(), verifySignOut: vi.fn(), deleteUser: vi.fn(), getUserById: vi.fn(),
  sendOtp: vi.fn(), verifyOtp: vi.fn(), signOut: vi.fn(), challenge: vi.fn(), verifierAssurance: vi.fn(), verifiedUser: vi.fn(),
}));
vi.mock('@/supabase/server', () => ({ createClient: mock.sessionClient }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mock.newClient }));
vi.mock('@/lib/env', () => ({ getRequiredEnvVar: (name: string) => process.env[name] }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error('redirect:' + url); } }));
import { deleteAccount, sendDeletionCode } from './actions';

const owner = { id: 'owner', email: 'owner@example.invalid', factors: [] };
function form() {
  const value = new FormData();
  value.set('password', 'fixture-password');
  value.set('confirmation', 'DELETE');
  value.set('understand', 'yes');
  value.set('user_id', 'foreign');
  value.set('email', 'foreign@example.invalid');
  return value;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fixture-anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-admin');
  mock.getUser.mockResolvedValue({ data: { user: owner }, error: null });
  mock.assurance.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null });
  mock.sessionClient.mockResolvedValue({ auth: {
    getUser: mock.getUser, signOut: mock.signOut,
    mfa: { getAuthenticatorAssuranceLevel: mock.assurance },
  } });
  mock.newClient.mockImplementation((_url, key) => key === 'fixture-admin'
    ? { auth: { admin: { deleteUser: mock.deleteUser, getUserById: mock.getUserById } } }
    : { auth: { signInWithPassword: mock.verify, signInWithOtp: mock.sendOtp, verifyOtp: mock.verifyOtp, signOut: mock.verifySignOut,
      getUser: mock.verifiedUser, mfa: {
        challengeAndVerify: mock.challenge, getAuthenticatorAssuranceLevel: mock.verifierAssurance,
      } } });
  mock.verify.mockResolvedValue({ data: { user: owner, session: { access_token: 'fixture' } }, error: null });
  mock.deleteUser.mockResolvedValue({ error: null });
  mock.sendOtp.mockResolvedValue({ error: null });
  mock.verifyOtp.mockResolvedValue({ data: { user: owner, session: { access_token: 'fixture' } }, error: null });
  mock.challenge.mockResolvedValue({ error: null });
  mock.verifierAssurance.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null });
  mock.verifiedUser.mockResolvedValue({ data: { user: owner }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

it('requires explicit permanent confirmation before any authentication or deletion', async () => {
  expect(await deleteAccount({}, new FormData())).toHaveProperty('error');
  expect(mock.sessionClient).not.toHaveBeenCalled();
  const value = form(); value.set('confirmation', 'delete');
  expect(await deleteAccount({}, value)).toHaveProperty('error');
  expect(mock.newClient).not.toHaveBeenCalled();
});
it('reauthenticates the server owner and deletes that ID, ignoring client ownership fields', async () => {
  await expect(deleteAccount({}, form())).rejects.toThrow('redirect:/login?message=');
  expect(mock.verify).toHaveBeenCalledWith({ email: owner.email, password: 'fixture-password' });
  expect(mock.deleteUser).toHaveBeenCalledExactlyOnceWith('owner', false);
  expect(mock.getUserById).not.toHaveBeenCalled();
  expect(mock.verifySignOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(mock.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(mock.newClient.mock.calls[0][2]).toMatchObject({ auth: { persistSession: false } });
});
it('blocks missing identity, missing configuration and wrong-password identity mismatches', async () => {
  mock.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
  expect(await deleteAccount({}, form())).toHaveProperty('error');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  expect(await deleteAccount({}, form())).toHaveProperty('error');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fixture-admin');
  mock.verify.mockResolvedValueOnce({ data: { user: { id: 'foreign' }, session: {} }, error: null });
  expect(await deleteAccount({}, form())).toHaveProperty('error');
  mock.verify.mockResolvedValueOnce({ data: { user: null, session: null }, error: { message: 'private' } });
  const result = await deleteAccount({}, form());
  expect(result.error).not.toContain('private');
  expect(mock.deleteUser).not.toHaveBeenCalled();
});
it('requires an elevated session for an account with verified MFA', async () => {
  mock.getUser.mockResolvedValue({ data: { user: { ...owner, factors: [{ status: 'verified' }] } }, error: null });
  mock.verify.mockResolvedValue({data:{user:{...owner,factors:[{status:'verified',factor_type:'phone'}]},session:{}},error:null});
  mock.assurance.mockResolvedValueOnce({ data: { currentLevel: 'aal1' }, error: null });
  expect(await deleteAccount({}, form())).toHaveProperty('error');
  expect(mock.deleteUser).not.toHaveBeenCalled();
  await expect(deleteAccount({}, form())).rejects.toThrow('redirect:/login?message=');
});
it('checks an interrupted deletion and succeeds only on a verified missing owner', async () => {
  mock.deleteUser.mockRejectedValueOnce(new Error('private transport details'));
  mock.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 404, code: 'user_not_found' } });
  await expect(deleteAccount({}, form())).rejects.toThrow('redirect:/login?message=');
  expect(mock.getUserById).toHaveBeenCalledWith('owner');
});
it('retains retry feedback for an existing owner, denied access or an uncertain read', async () => {
  mock.deleteUser.mockResolvedValue({ error: { status: 500, message: 'private SQL' } });
  mock.getUserById.mockResolvedValueOnce({ data: { user: owner }, error: null });
  expect(await deleteAccount({}, form())).toHaveProperty('error');
  mock.getUserById.mockResolvedValueOnce({ data: { user: null }, error: { status: 404, code: 'other_error' } });
  expect(await deleteAccount({}, form())).toHaveProperty('error');
  mock.getUserById.mockRejectedValueOnce(new Error('private network'));
  const result = await deleteAccount({}, form());
  expect(result.error).toMatch(/could not be confirmed/);
  expect(result.error).not.toContain('private');
  expect(mock.signOut).not.toHaveBeenCalled();
});

it('keeps an authentication transport failure recoverable before creating privileged clients', async () => {
  mock.getUser.mockRejectedValueOnce(new Error('private transport'));
  const result = await deleteAccount({}, form());
  expect(result.error).toMatch(/Please retry/);
  expect(result.error).not.toContain('private');
  expect(mock.newClient).not.toHaveBeenCalled();
});

const totpOwner = { ...owner, factors: [{ id: 'owned-factor', status: 'verified', factor_type: 'totp' }] };
function totpForm() {
  const value = form();
  value.set('factor_id', 'owned-factor');
  value.set('totp_code', '123456');
  return value;
}
it('requires a freshly confirmed owned TOTP factor even with an elevated original session', async () => {
  mock.verify.mockResolvedValue({ data: { user: totpOwner, session: {} }, error: null });
  await expect(deleteAccount({}, totpForm())).rejects.toThrow('redirect:/login?message=');
  expect(mock.challenge).toHaveBeenCalledWith({ factorId: 'owned-factor', code: '123456' });
  expect(mock.verifiedUser).toHaveBeenCalled();
  expect(mock.verifySignOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(mock.deleteUser).toHaveBeenCalledWith('owner', false);
});
it('rejects foreign, unverified and malformed authenticator inputs before challenging', async () => {
  mock.verify.mockResolvedValue({ data: { user: {...totpOwner,factors:[...totpOwner.factors,{id:'pending-factor',status:'unverified',factor_type:'totp'}]}, session: {} }, error: null });
  const pending = totpForm(); pending.set('factor_id','pending-factor');
  expect(await deleteAccount({}, pending)).toHaveProperty('error');
  const foreign = totpForm(); foreign.set('factor_id','foreign-factor');
  expect(await deleteAccount({}, foreign)).toHaveProperty('error');
  const malformed = totpForm(); malformed.set('totp_code','12');
  expect(await deleteAccount({}, malformed)).toHaveProperty('error');
  expect(mock.challenge).not.toHaveBeenCalled();
  expect(mock.deleteUser).not.toHaveBeenCalled();
});
it('does not delete after a rejected code, low assurance or changed verified identity', async () => {
  mock.verify.mockResolvedValue({ data: { user: totpOwner, session: {} }, error: null });
  mock.challenge.mockResolvedValueOnce({ error: { message: 'private MFA detail' } });
  expect(await deleteAccount({}, totpForm())).toHaveProperty('error');
  mock.verifierAssurance.mockResolvedValueOnce({ data: { currentLevel: 'aal1' }, error: null });
  expect(await deleteAccount({}, totpForm())).toHaveProperty('error');
  mock.verifiedUser.mockResolvedValueOnce({ data: { user: { id: 'foreign' } }, error: null });
  expect(await deleteAccount({}, totpForm())).toHaveProperty('error');
  expect(mock.deleteUser).not.toHaveBeenCalled();
  expect(mock.verifySignOut).toHaveBeenCalledTimes(3);
});

function emailForm() {
  const value = form();
  value.delete('password');
  value.set('verification_method', 'email');
  value.set('email_code', '654321');
  return value;
}
it('sends a code only to the verified owner and disables automatic signup', async () => {
  expect(await sendDeletionCode()).toHaveProperty('success');
  expect(mock.sendOtp).toHaveBeenCalledWith({email:owner.email,options:{shouldCreateUser:false}});
  expect(mock.deleteUser).not.toHaveBeenCalled();
  mock.getUser.mockResolvedValueOnce({data:{user:null},error:null});
  expect(await sendDeletionCode()).toHaveProperty('error');
  expect(mock.sendOtp).toHaveBeenCalledTimes(1);
});
it('keeps code delivery failures retryable without forwarding provider details', async () => {
  mock.sendOtp.mockResolvedValueOnce({error:{message:'private provider detail'}});
  const result=await sendDeletionCode();
  expect(result.error).toMatch(/retry/);
  expect(result.error).not.toContain('private');
  mock.sendOtp.mockRejectedValueOnce(new Error('private transport'));
  expect(await sendDeletionCode()).toHaveProperty('error');
});
it('verifies an OAuth-only owner through email without requiring a password', async () => {
  await expect(deleteAccount({}, emailForm())).rejects.toThrow('redirect:/login?message=');
  expect(mock.verify).not.toHaveBeenCalled();
  expect(mock.verifyOtp).toHaveBeenCalledWith({email:owner.email,token:'654321',type:'email'});
  expect(mock.deleteUser).toHaveBeenCalledWith('owner',false);
  expect(mock.verifySignOut).toHaveBeenCalledWith({scope:'local'});
});
it('rejects invalid email codes and mismatched identities before deletion', async () => {
  const invalid=emailForm(); invalid.set('email_code','bad');
  expect(await deleteAccount({},invalid)).toHaveProperty('error');
  expect(mock.verifyOtp).not.toHaveBeenCalled();
  mock.verifyOtp.mockResolvedValueOnce({data:{user:{id:'foreign'},session:{}},error:null});
  expect(await deleteAccount({},emailForm())).toHaveProperty('error');
  mock.verifyOtp.mockResolvedValueOnce({data:{user:null,session:null},error:{message:'private code detail'}});
  const result=await deleteAccount({},emailForm());
  expect(result.error).not.toContain('private');
  expect(mock.deleteUser).not.toHaveBeenCalled();
});
it('requires the owned authenticator after successful email verification', async () => {
  mock.verifyOtp.mockResolvedValue({data:{user:totpOwner,session:{}},error:null});
  expect(await deleteAccount({},emailForm())).toHaveProperty('error',expect.stringContaining('Request a new email code'));
  expect(mock.deleteUser).not.toHaveBeenCalled();
  const value=emailForm(); value.set('factor_id','owned-factor'); value.set('totp_code','123456');
  await expect(deleteAccount({},value)).rejects.toThrow('redirect:/login?message=');
  expect(mock.challenge).toHaveBeenCalledWith({factorId:'owned-factor',code:'123456'});
});
