'use client';

import { useActionState } from 'react';
import { revokeConnections } from '@/app/settings/privacy/actions';
import { SubmitButton } from './submit-button';

export function PrivacyAccessForm() {
  const [state, action, pending] = useActionState(revokeConnections, {});
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={pending} className="space-y-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="confirm" value="revoke" required className="mt-1" />
          <span>Revoke all my existing AI keys and pause reminders on my registered devices.</span>
        </label>
        <SubmitButton label="Revoke keys and pause reminders" pendingLabel="Updating connections…" />
      </fieldset>
      {state.error && <p role="alert" className="text-red-800">{state.error}</p>}
      {state.success && <p role="status" className="text-emerald-800">{state.success}</p>}
    </form>
  );
}
