'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { useActionState } from 'react';
import { createPlan, editPlan } from '@/app/planning/actions';
import type { Choice, Schedule } from '@/lib/planning';
import { SubmitButton } from './submit-button';

export const fieldClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900';
export function PlanForm({ plan, date = '', projects = [], skills = [], projectId = '', returnTo = '/today', series = [] }: { series?: Schedule[]; plan?: Schedule; date?: string; projects?: Choice[]; skills?: Choice[]; projectId?: string; returnTo?: string }) {
  const [state, action] = useActionState(plan ? editPlan.bind(null, plan.id) : createPlan, {});
  const initial: Record<string,string> = {
    title: plan?.title ?? '', scheduled_date: plan?.scheduled_date ?? date,
    scheduled_time: plan?.scheduled_time?.slice(0,5) ?? '',
    priority: plan?.priority ?? 'normal', estimated_minutes: String(plan?.estimated_minutes ?? ''),
    energy: plan?.energy ?? '', project_id: plan?.project_id ?? projectId, skill_id: plan?.skill_id ?? '',
    deadline:plan?.deadline ?? '', repeat: 'none', occurrences: '12', scope: 'one', notes: plan?.notes ?? ''
  };
  const initialKey = JSON.stringify(initial);
  const editing = Boolean(plan);
  const [draft, setDraft] = useState(initial);
  useEffect(() => { setDraft(JSON.parse(initialKey)); }, [initialKey]);
  useEffect(() => {
    if (state.savedAt && !editing) setDraft(JSON.parse(initialKey));
  }, [state.savedAt, editing, initialKey]);
  const bind = (name: string) => ({ value: draft[name] ?? '', onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { const value = event.target.value; setDraft(current => ({ ...current, [name]: value })); } });
  return <form action={action} className="space-y-3">
    <input type="hidden" name="expected_updated_at" value={plan?.updated_at ?? ''} />
    <input type="hidden" name="series_revisions" value={JSON.stringify(Object.fromEntries(series.filter(item=>plan?.series_id && item.series_id===plan.series_id).map(item=>[item.id,item.updated_at])))} />
    <input type="hidden" name="return_to" value={returnTo} />
    <input type="hidden" name="return_date" value={plan?.scheduled_date ?? date} />
    {state.error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{state.error}</p>}
    {state.success && <p role="status" className="rounded bg-emerald-50 p-3 text-emerald-800">{state.success}</p>}
    <label className="block text-sm">Title<input name="title" required maxLength={120} {...bind('title')} placeholder="What would you like to do?" className={fieldClass} /></label>
    <div className="grid grid-cols-2 gap-3">
      <label className="block text-sm">Date (optional)<input name="scheduled_date" type="date" min="0002-01-01" max="9998-12-31" {...bind('scheduled_date')} className={fieldClass} /></label>
      <label className="block text-sm">Time (optional)<input name="scheduled_time" type="time" {...bind('scheduled_time')} className={fieldClass} /></label>
    </div>
    <label className="block text-sm">Deadline (optional)<input name="deadline" type="date" min="0002-01-01" max="9998-12-31" {...bind("deadline")} className={fieldClass} /></label>
    <p className="text-xs text-slate-500">The deadline is separate from the planned execution date. No date? It goes to your Inbox. A time needs a date.</p>
    <details>
      <summary className="cursor-pointer text-sm font-medium">{plan ? 'Details and links' : 'More options: priority, duration, repeat and links'}</summary>
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Priority<select aria-label="Priority" name="priority" {...bind('priority')} className={fieldClass}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
          <label className="block text-sm">Estimated minutes<input name="estimated_minutes" type="number" min={1} max={1440} {...bind('estimated_minutes')} className={fieldClass} /></label>
        </div>
        <label className="block text-sm">Energy needed<select aria-label="Energy needed" name="energy" {...bind('energy')} className={fieldClass}><option value="">Any energy level</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        <label className="block text-sm">Project<select aria-label="Project" name="project_id" {...bind('project_id')} className={fieldClass}><option value="">No project</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="block text-sm">Skill<select aria-label="Skill" name="skill_id" {...bind('skill_id')} className={fieldClass}><option value="">No skill</option>{skills.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {!plan && <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">Repeat<select aria-label="Repeat" name="repeat" {...bind('repeat')} className={fieldClass}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
          <label className="block text-sm">Occurrences<input name="occurrences" type="number" min={2} max={52} {...bind('occurrences')} className={fieldClass} /></label>
        </div>}
        {plan?.series_id && <label className="block text-sm">Apply edits to<select aria-label="Apply edits to" name="scope" {...bind('scope')} className={fieldClass}><option value="one">Only this occurrence</option><option value="future">This and future unfinished occurrences</option></select></label>}
        <label className="block text-sm">Notes (optional)<textarea name="notes" rows={3} maxLength={2000} {...bind('notes')} className={fieldClass} /></label>
      </div>
    </details>
    <SubmitButton label={plan ? 'Save changes' : 'Add plan'} />
  </form>;
}
