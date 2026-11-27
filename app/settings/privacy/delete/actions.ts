'use server';

import { createClient as supabaseClient, type User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { createClient } from '@/supabase/server';
import { getRequiredEnvVar } from '@/lib/env';

export type DeleteAccountState = { error?: string };

export async function deleteAccount(
  _state: DeleteAccountState,
  form: FormData
): Promise<DeleteAccountState> {
  const password = form.get('password');
  if (form.get('confirmation') !== 'DELETE' || form.get('understand') !== 'yes' ||
      typeof password !== 'string' || !password || password.length > 1024) {
    return { error: 'Enter your current password, type DELETE and confirm permanent deletion.' };
  }
  let client: Awaited<ReturnType<typeof createClient>>;
  let user: User;
  try {
    client = await createClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return { error: 'Sign in again before deleting your account.' };
    user = data.user;
  } catch {
    return { error: 'Could not verify your signed-in account. Please retry.' };
  }
  if (!user.email || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: 'Account deletion is currently unavailable. Please contact the app administrator.' };
  }
  try {
    const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
    const verifier = supabaseClient(
      getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
      getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      options
    );
    let verified = false;
    try {
      const { data, error } = await verifier.auth.signInWithPassword({ email: user.email, password });
      verified = !error && data.user?.id === user.id && Boolean(data.session);
      if (!verified) return { error: 'Could not verify your current password. Please try again.' };

      const factors = data.user?.factors?.filter(factor => factor.status === 'verified') ?? [];
      const authenticators = factors.filter(factor => factor.factor_type === 'totp');
      if (authenticators.length) {
        const selected = form.get('factor_id');
        const factor = selected === null && authenticators.length === 1
          ? authenticators[0]
          : authenticators.find(item => item.id === selected);
        const code = form.get('totp_code');
        if (!factor || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
          return { error: 'Choose your authenticator and enter its current six-digit code.' };
        }
        const challenge = await verifier.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
        if (challenge.error) return { error: 'Could not verify the authenticator code. Enter a new code and retry.' };
        const assurance = await verifier.auth.mfa.getAuthenticatorAssuranceLevel();
        const identity = await verifier.auth.getUser();
        if (assurance.error || assurance.data?.currentLevel !== 'aal2' ||
            identity.error || identity.data.user?.id !== user.id) {
          return { error: 'Multi-factor verification could not be confirmed. Please retry.' };
        }
      } else if (factors.length) {
        const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assuranceError || assurance?.currentLevel !== 'aal2') {
          return { error: 'Complete multi-factor sign-in before deleting your account.' };
        }
      }
    } finally {
      // This independent client never writes browser session cookies.
      try { await verifier.auth.signOut({ scope: 'local' }); } catch {}
    }
    const admin = supabaseClient(
      getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
      getRequiredEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
      options
    );
    let deleted = false;
    try {
      const { error } = await admin.auth.admin.deleteUser(user.id, false);
      deleted = !error;
    } catch {
      // A lost response can follow a committed deletion. Check the same user.
    }
    if (!deleted) {
      const { error } = await admin.auth.admin.getUserById(user.id);
      deleted = error?.status === 404 && error.code === 'user_not_found';
    }
    if (!deleted) {
      return { error: 'Deletion could not be confirmed. Your account may still exist. Retry or sign in again to check.' };
    }
  } catch {
    return { error: 'Deletion could not be confirmed. Retry or sign in again to check your account.' };
  }
  try { await client.auth.signOut({ scope: 'local' }); } catch {}
  redirect('/login?message=' + encodeURIComponent('Your account and its Focus Tracker records have been deleted.'));
}
