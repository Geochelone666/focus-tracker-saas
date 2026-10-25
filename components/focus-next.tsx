'use client';
import { useActionState } from 'react';
import { nextFocusPhase } from '@/app/dashboard/focus-actions';
import type { FocusSession } from '@/lib/focus-state';
export function FocusNext({ session }: { session: FocusSession }) {
  const [result, action, pending] = useActionState(nextFocusPhase,{});
  if (session.focus_status !== 'completed') return null;
  const focus = !session.session_kind || session.session_kind === 'focus';
  const done = !focus && (session.cycle_number ?? 1) >= (session.cycle_count ?? 1);
  const long = (session.cycle_number ?? 1) % (session.long_break_every ?? 4) === 0;
  return <section className="my-4 rounded-lg border bg-white p-4">
    <h2 className="font-semibold">{done ? 'Cycle complete' : focus ? 'Focus complete · take a break' : 'Break complete · ready for the next round?'}</h2>
    <p className="my-2 text-sm">Round {session.cycle_number ?? 1} of {session.cycle_count ?? 1}. Focus and break time are tracked separately.</p>
    {!done && <form action={action}><input type="hidden" name="session_id" value={session.id} /><button disabled={pending} className="rounded bg-slate-900 px-4 py-2 text-white">{pending ? 'Starting…' : focus ? `Start ${long ? 'long' : 'short'} break` : 'Start next focus'}</button></form>}
    {result.error && <p role="alert" className="mt-2 text-red-800">{result.error}</p>}
  </section>;
}
