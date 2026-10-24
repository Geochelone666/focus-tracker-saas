'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { transitionFocus } from '@/app/dashboard/focus-actions';
import { focusElapsedMs, type FocusSession } from '@/lib/focus-state';
import { FocusAlerts } from './focus-alerts';
import { formatElapsed } from '@/lib/active-session';

export function FocusControls({ session, skills = [], observedAt }: { session: FocusSession; skills?: { id: string; name: string }[]; observedAt: number }) {
  const [result, action, pending] = useActionState(transitionFocus, {});
  const [now, setNow] = useState<number | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const automatic = useRef<HTMLButtonElement>(null);
  const attempted = useRef<string | null>(null);
  const router = useRouter();
  const label = !session.session_kind || session.session_kind === "focus" ? "focus" : "break";
  const elapsed = focusElapsedMs(session, now ?? observedAt);
  const remaining = Math.max(0, (session.target_seconds ?? 0) * 1000 - elapsed);
  const expired = session.focus_mode === 'countdown' && remaining === 0;
  useEffect(() => {
    // Correct constant device-clock skew using the server render timestamp.
    const clientAt = Date.now();
    const tick = () => setNow(observedAt + Date.now() - clientAt);
    tick();
    const timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick); };
  }, [observedAt]);
  useEffect(() => {
    const key = `${session.id}:${session.focus_revision}`;
    if (now !== null && expired && session.focus_status === 'running' && !pending && attempted.current !== key) {
      attempted.current = key;
      form.current?.requestSubmit(automatic.current!);
    }
  }, [expired, now, pending, session.id, session.focus_revision, session.focus_status]);
  // Refresh idle controls across devices even while a timer is visible; never replace an edited note.
  useEffect(() => {
    let editing=false;
    const dirty=(event:Event)=>{if(event.target instanceof Element && event.target.closest("form"))editing=true;};
    document.addEventListener("input",dirty);document.addEventListener("change",dirty);
    const refresh = () => {
      if (!editing && document.visibilityState === 'visible' && !form.current?.querySelector('textarea')?.value && !form.current?.contains(document.activeElement)) router.refresh();
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => { clearInterval(timer);document.removeEventListener('input',dirty);document.removeEventListener('change',dirty); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); };
  }, [router]);
  return <div className="min-w-0">
    <p className="mt-3 font-semibold">{label === "break" ? session.session_kind === "long_break" ? "Long break" : "Short break" : "Focus"} · round {session.cycle_number ?? 1} of {session.cycle_count ?? 1}</p>
    <p className="mt-3 text-sm">{session.focus_status === 'paused' ? 'Paused · paused time is excluded' : expired ? 'Countdown finished' : session.focus_mode === 'countdown' ? 'Time remaining' : 'Focused time'}</p>
    <p role="timer" aria-label={session.focus_mode === 'countdown' ? 'Focus time remaining' : 'Elapsed focus time'} className="my-3 text-4xl font-semibold tabular-nums">{formatElapsed(session.focus_mode === 'countdown' ? remaining : elapsed)}</p>
    {elapsed > 12 * 3600000 && <p role="status" className="my-2 text-sm text-amber-800">This session exceeds 12 hours. Review the time before finishing, or abandon it to keep a zero-credit record.</p>}
    <FocusAlerts expired={expired} identity={`${session.id}:${session.focus_revision}`} />
    <form ref={form} action={action} className="flex min-w-0 flex-wrap items-center gap-3">
      <input type="hidden" name="session_id" value={session.id} /><input type="hidden" name="focus_revision" value={session.focus_revision} />
      <label className="text-sm">Skill on completion<select name="skill_id" defaultValue={session.skill_id ?? ""} className="ml-2 max-w-full rounded border bg-white px-2 py-2"><option value="">Keep current skill</option>{skills.map(skill => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
      <label className="w-full text-sm">Outcome / note (optional)<textarea name="note" maxLength={200} rows={2} className="mt-1 block w-full rounded border px-3 py-2" /></label>
      <button disabled={pending || expired} name="focus_action" value={session.focus_status === 'paused' ? 'resume' : 'pause'} className="rounded border px-4 py-2 disabled:opacity-50">{session.focus_status === 'paused' ? `Resume ${label}` : `Pause ${label}`}</button>
      <button ref={automatic} disabled={pending} name="focus_action" value="complete" className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">{pending ? 'Saving…' : expired ? 'Save completed focus' : `Finish ${label}`}</button>
      <button disabled={pending} name="focus_action" value="abandon" className="rounded border px-4 py-2 disabled:opacity-50">Abandon {label}</button>
      {result.error && <p role="alert" className="w-full break-words text-red-800">{result.error} <button type="button" className="underline" onClick={() => router.refresh()}>Refresh session</button></p>}
    </form>
    <p className="mt-2 text-xs text-slate-500">Finish records this phase. Break time never counts as focus. Abandon keeps a zero-credit record. Alerts are off until you enable them.</p>
  </div>;
}
