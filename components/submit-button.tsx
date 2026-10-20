'use client';

import { useFormStatus } from 'react-dom';

export function SubmitButton({ label, pendingLabel = 'Saving…' }: { label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-busy={pending}
    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-wait disabled:opacity-50">
    {pending ? pendingLabel : label}
  </button>;
}
