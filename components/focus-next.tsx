'use client';
import { useActionState } from 'react';
import { nextFocusPhase, saveCompletedFocusOutcome } from '@/app/dashboard/focus-actions';
import type { FocusSession } from '@/lib/focus-state';
export function FocusNext({ session,skills=[] }: { session: FocusSession; skills?:{id:string;name:string}[] }) {
  const [result, action, pending] = useActionState(nextFocusPhase,{});
  const [outcomeResult,saveOutcome,savingOutcome]=useActionState(saveCompletedFocusOutcome,{});
  if (session.focus_status !== 'completed') return null;
  const focus = !session.session_kind || session.session_kind === 'focus';
  const done = !focus && (session.cycle_number ?? 1) >= (session.cycle_count ?? 1);
  const long = (session.cycle_number ?? 1) % (session.long_break_every ?? 4) === 0;
  return <section className="my-4 rounded-lg border bg-white p-4">
    <h2 className="font-semibold">{done ? 'Cycle complete' : focus ? 'Focus complete · take a break' : 'Break complete · ready for the next round?'}</h2>
    <p className="my-2 text-sm">Round {session.cycle_number ?? 1} of {session.cycle_count ?? 1}. Focus and break time are tracked separately.</p>
    {!done && <form action={action}><input type="hidden" name="session_id" value={session.id} /><button disabled={pending} className="rounded bg-slate-900 px-4 py-2 text-white">{pending ? 'Starting…' : focus ? `Start ${long ? 'long' : 'short'} break` : 'Start next focus'}</button></form>}
    {focus && <form action={saveOutcome} className="my-4 space-y-3 border-t pt-4">
      <h3 className="font-medium">Save the outcome of this focus</h3>
      <p className="text-xs text-slate-600">You can add an outcome or change the skill even after automatic completion. Saved focus time and timestamps will not change.</p>
      <input type="hidden" name="session_id" value={session.id}/>
      <input type="hidden" name="focus_revision" value={session.focus_revision}/>
      <label className="block text-sm">Outcome / note (optional)
        <textarea name="note" maxLength={200} defaultValue={session.note??''} rows={2} className="mt-1 block w-full rounded border p-2"/>
      </label>
      <label className="block text-sm">Skill
        <select name="skill_id" defaultValue={session.skill_id??''} className="mt-1 block max-w-full rounded border p-2">
          <option value="">No skill</option>{skills.map(skill=><option key={skill.id} value={skill.id}>{skill.name}</option>)}
        </select>
      </label>
      <button disabled={savingOutcome} className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">{savingOutcome?'Saving…':'Save outcome'}</button>
      {outcomeResult.saved&&<p role="status" className="text-sm text-emerald-800">Outcome saved.</p>}
      {outcomeResult.error&&<p role="alert" className="text-sm text-red-800">{outcomeResult.error}</p>}
    </form>}

    {result.error && <p role="alert" className="mt-2 text-red-800">{result.error}</p>}
  </section>;
}
