'use client';

import { useActionState } from 'react';
import { deleteAccount } from '@/app/settings/privacy/delete/actions';
import { SubmitButton } from './submit-button';

export function DeleteAccountForm({ authenticators = [] }: {
  authenticators?: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(deleteAccount, {});
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={pending} className="space-y-4">
        <label className="block">Current password
          <input type="password" name="password" autoComplete="current-password" required maxLength={1024}
            className="mt-1 block w-full rounded border p-3" />
        </label>
        {authenticators.length > 0 && <>
          <label className="block">Authenticator
            <select name="factor_id" required className="mt-1 block w-full rounded border p-3">
              {authenticators.map(factor => <option key={factor.id} value={factor.id}>{factor.name}</option>)}
            </select>
          </label>
          <label className="block">Authenticator code
            <input name="totp_code" type="text" inputMode="numeric" autoComplete="one-time-code"
              required pattern="[0-9]{6}" minLength={6} maxLength={6}
              className="mt-1 block w-full rounded border p-3" />
          </label>
        </>}
        <label className="block">Type DELETE to confirm
          <input name="confirmation" autoComplete="off" required pattern="DELETE"
            className="mt-1 block w-full rounded border p-3" />
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="understand" value="yes" required className="mt-1" />
          <span>I understand that my account and its records will be permanently deleted.</span>
        </label>
        <SubmitButton label="Permanently delete my account" pendingLabel="Deleting account…" />
      </fieldset>
      {state.error && <p role="alert" className="text-red-800">{state.error}</p>}
    </form>
  );
}
