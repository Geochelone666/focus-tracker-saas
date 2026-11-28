'use client';

import { useActionState, useState, useTransition } from 'react';
import {
  deleteAccount,
  sendDeletionCode,
  type DeleteAccountState,
} from '@/app/settings/privacy/delete/actions';
import { SubmitButton } from './submit-button';

export function DeleteAccountForm({
  authenticators = [],
}: {
  authenticators?: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(deleteAccount, {});
  const [method, setMethod] = useState('password');
  const [delivery, setDelivery] = useState<DeleteAccountState>({});
  const [sending, startSending] = useTransition();
  const sendCode = () => {
    setDelivery({});
    startSending(async () => {
      try {
        setDelivery(await sendDeletionCode());
      } catch {
        setDelivery({ error: 'Could not send a verification code. Please retry.' });
      }
    });
  };
  return (
    <div className="space-y-4">
      <label className="block">
        Verify with
        <select
          aria-label="Verify with"
          value={method}
          disabled={pending || sending}
          onChange={(event) => {
            setMethod(event.target.value);
            setDelivery({});
          }}
          className="mt-1 block w-full rounded border p-3"
        >
          <option value="password">Current password</option>
          <option value="email">Email verification code</option>
        </select>
      </label>
      <form action={action} className="space-y-4">
        <input type="hidden" name="verification_method" value={method} />
        <fieldset disabled={pending || sending} className="space-y-4">
          {method === 'password' ? (
            <label className="block">
              Current password
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                maxLength={1024}
                className="mt-1 block w-full rounded border p-3"
              />
            </label>
          ) : (
            <div className="space-y-3">
              <button type="button" onClick={sendCode} className="rounded border px-4 py-2">
                {sending ? 'Sending code…' : 'Send verification code'}
              </button>
              <label className="block">
                Email verification code
                <input
                  name="email_code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  pattern="[0-9]{6,10}"
                  minLength={6}
                  maxLength={10}
                  className="mt-1 block w-full rounded border p-3"
                />
              </label>
              {delivery.error && (
                <p role="alert" className="text-red-800">
                  {delivery.error}
                </p>
              )}
              {delivery.success && <p role="status">{delivery.success}</p>}
            </div>
          )}
          {authenticators.length > 0 && (
            <>
              <label className="block">
                Authenticator
                <select name="factor_id" required className="mt-1 block w-full rounded border p-3">
                  {authenticators.map((factor) => (
                    <option key={factor.id} value={factor.id}>
                      {factor.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Authenticator code
                <input
                  name="totp_code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  className="mt-1 block w-full rounded border p-3"
                />
              </label>
            </>
          )}
          <label className="block">
            Type DELETE to confirm
            <input
              name="confirmation"
              autoComplete="off"
              required
              pattern="DELETE"
              className="mt-1 block w-full rounded border p-3"
            />
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="understand" value="yes" required className="mt-1" />
            <span>I understand that my account and its records will be permanently deleted.</span>
          </label>
          <SubmitButton label="Permanently delete my account" pendingLabel="Deleting account…" />
        </fieldset>
        {state.error && (
          <p role="alert" className="text-red-800">
            {state.error}
          </p>
        )}
      </form>
    </div>
  );
}
