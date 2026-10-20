'use client';

import { useEffect, useRef } from 'react';
import { useActionState } from 'react';
import { createPlan, editPlan } from '@/app/planning/actions';
import type { Choice, Schedule } from '@/lib/planning';
import { SubmitButton } from './submit-button';

export const fieldClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900';
export function PlanForm({ plan, date = '', projects = [], skills = [], projectId = '', returnTo = '/today' }: { plan?: Schedule; date?: string; projects?: Choice[]; skills?: Choice[]; projectId?: string; returnTo?: string }) {
  const [state, action] = useActionState(plan ? editPlan.bind(null, plan.id) : createPlan, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.savedAt && !plan) ref.current?.reset(); }, [state.savedAt, plan]);
  return <form ref={ref} action={action} className="space-y-3">
    <input type="hidden" name="return_to" value={returnTo} />
    {state.error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{state.error}</p>}
    {state.success && <p role="status" className="rounded bg-emerald-50 p-3 text-emerald-800">{state.success}</p>}
    <label className="block text-sm">Title<input name="title" required maxLength={120} defaultValue={plan?.title ?? ''} placeholder="What would you like to do?" className={fieldClass} /></label>
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm">Date (optional)<input name="scheduled_date" type="date" min="0002-01-01" max="9998-12-31" defaultValue={plan?.scheduled_date ?? date} className={fieldClass} /></label>
      <label className="block text-sm">Time (optional)<input name="scheduled_time" type="time" defaultValue={plan?.scheduled_time?.slice(0,5) ?? ''} className={fieldClass} /></label>
    </div>
    <p className="text-xs text-slate-500">No date? It goes to your Inbox. A time needs a date.</p>
    <details>
      <summary className="cursor-pointer text-sm font-medium">{plan ? 'Details and links' : 'More options: priority, duration, repeat and links'}</summary>
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Priority<select name="priority" defaultValue={plan?.priority ?? 'normal'} className={fieldClass}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
          <label className="block text-sm">Estimated minutes<input name="estimated_minutes" type="number" min={1} max={1440} defaultValue={plan?.estimated_minutes ?? ''} className={fieldClass} /></label>
        </div>
        <label className="block text-sm">Energy needed<select name="energy" defaultValue={plan?.energy ?? ''} className={fieldClass}><option value="">Any energy level</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        <label className="block text-sm">Project<select name="project_id" defaultValue={plan?.project_id ?? projectId} className={fieldClass}><option value="">No project</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="block text-sm">Skill<select name="skill_id" defaultValue={plan?.skill_id ?? ''} className={fieldClass}><option value="">No skill</option>{skills.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {!plan && <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Repeat<select name="repeat" defaultValue="none" className={fieldClass}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
          <label className="block text-sm">Occurrences<input name="occurrences" type="number" min={2} max={52} defaultValue={12} className={fieldClass} /></label>
        </div>}
        {plan?.series_id && <label className="block text-sm">Apply edits to<select name="scope" className={fieldClass}><option value="one">Only this occurrence</option><option value="future">This and future unfinished occurrences</option></select></label>}
        <label className="block text-sm">Notes (optional)<textarea name="notes" rows={3} maxLength={2000} defaultValue={plan?.notes ?? ''} className={fieldClass} /></label>
      </div>
    </details>
    <SubmitButton label={plan ? 'Save changes' : 'Add plan'} />
  </form>;
}
