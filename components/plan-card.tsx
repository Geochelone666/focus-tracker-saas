import { changePlan } from '@/app/planning/actions';
import { startSession } from '@/app/dashboard/actions';
import type { Choice, Schedule } from '@/lib/planning';
import { FocusOptions } from './focus-options';
import { PlanForm } from './plan-form';
import { SubmitButton } from './submit-button';

export function PlanCard({ plan, projects, skills, returnTo = '/today', actualMinutes, series = [] }: { series?: Schedule[]; plan: Schedule; projects: Choice[]; skills: Choice[]; returnTo?: string; actualMinutes?: number }) {
  const project = projects.find(item => item.id === plan.project_id);
  const operation = (name: 'complete' | 'reopen' | 'trash' | 'restore' | 'today' | 'tomorrow' | 'inbox', label: string) => <form action={changePlan.bind(null, plan.id, name)}>
    <input type="hidden" name="expected_updated_at" value={plan.updated_at ?? ""} /><input type="hidden" name="return_to" value={returnTo} /><SubmitButton label={label} pendingLabel="Updating…" />
  </form>;
  if (plan.deleted_at) return <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-4"><span className="break-words">{plan.title}</span>{operation('restore', 'Restore')}</li>;
  return <li className="rounded-lg border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h3 className={`break-words font-semibold ${plan.is_done ? 'text-slate-500 line-through' : ''}`}>{plan.title}</h3>
        <p className="mt-1 text-sm text-slate-600">{plan.scheduled_date ?? 'Inbox'} · {plan.scheduled_time?.slice(0,5) ?? 'Any time'} · {plan.is_done ? 'Completed' : `${plan.priority} priority`}{plan.series_id ? ' · Repeats' : ''}</p>
        {(plan.estimated_minutes || actualMinutes !== undefined) && <p className="mt-1 text-sm text-slate-600">{plan.estimated_minutes ? `${plan.estimated_minutes}m planned` : ''}{plan.estimated_minutes && actualMinutes !== undefined ? ' · ' : ''}{actualMinutes !== undefined ? `${Math.floor(actualMinutes)}m focused` : ''}</p>}
        {plan.estimated_minutes!==null && actualMinutes!==undefined && <p className="mt-1 text-xs">{actualMinutes-plan.estimated_minutes>0?'+':''}{Number((actualMinutes-plan.estimated_minutes).toFixed(1))}m difference</p>}
        {plan.deadline && <p className="mt-1 text-sm">Deadline: {plan.deadline}</p>}
        {(project || plan.energy) && <p className="mt-1 text-sm text-slate-500">{project?.name}{project && plan.energy ? ' · ' : ''}{plan.energy ? `${plan.energy} energy` : ''}</p>}
        {plan.notes && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{plan.notes}</p>}
        {plan.deferral_reason && <p className="mt-2 text-xs text-slate-500">Last reschedule: {plan.deferral_reason}</p>}
      </div>
      {operation(plan.is_done ? 'reopen' : 'complete', plan.is_done ? 'Reopen' : '✓ Complete')}
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      {!plan.is_done && <form action={startSession} className="flex min-w-0 flex-wrap items-center gap-2">
        <FocusOptions />
        <input type="hidden" name="schedule_id" value={plan.id} />
        <input type="hidden" name="skill_id" value={plan.skill_id ?? ''} />
        <SubmitButton label="Start focus" pendingLabel="Starting…" />
      </form>}
      {!plan.is_done && operation('today', 'Move to today')}
      {!plan.is_done && operation('tomorrow', 'Tomorrow')}
    </div>
    <details className="mt-3">
      <summary className="cursor-pointer text-sm font-medium underline">Edit, reschedule or remove</summary>
      <div className="mt-3 max-w-lg"><PlanForm series={series} plan={plan} projects={projects} skills={skills} returnTo={returnTo} /></div>
      <form action={changePlan.bind(null, plan.id, 'tomorrow')} className="mt-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="expected_updated_at" value={plan.updated_at ?? ""} /><input type="hidden" name="return_to" value={returnTo} />
        <label className="text-sm">Why postpone? (optional)<input name="reason" maxLength={200} placeholder="e.g. Priorities changed" className="mt-1 block rounded border px-3 py-2" /></label>
        <SubmitButton label="Move to tomorrow" />
      </form>
      <div className="mt-4 flex flex-wrap gap-2">{operation('inbox','Move to Inbox')}{operation('trash','Move to Trash')}</div>
      <p className="mt-2 text-xs text-slate-500">Removed plans stay in Trash until restored. Focus history is preserved.</p>
    </details>
  </li>;
}
