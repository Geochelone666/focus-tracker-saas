'use client';

import { useActionState } from 'react';
import { createProject, saveReflection } from '@/app/planning/actions';
import { SubmitButton } from './submit-button';
import { fieldClass } from './plan-form';

export function ReflectionForm({ note }: { note: string }) {
  const [state, action] = useActionState(saveReflection, {});
  return <form action={action} className="space-y-3">
    <label className="block text-sm">What went well? What would you change tomorrow?<textarea name="note" maxLength={2000} rows={3} defaultValue={note} className={fieldClass} /></label>
    {state.error && <p role="alert" className="text-red-800">{state.error}</p>}
    {state.success && <p role="status" className="text-emerald-800">{state.success}</p>}
    <SubmitButton label="Save reflection" />
  </form>;
}
export function ProjectForm() {
  const [state, action] = useActionState(createProject, {});
  return <form action={action} className="space-y-3">
    <label className="block text-sm">Project or goal<input name="name" required maxLength={120} className={fieldClass} placeholder="Learn conversational French" /></label>
    <label className="block text-sm">Target date (optional)<input name="target_date" type="date" min="0002-01-01" max="9998-12-31" className={fieldClass} /></label>
    <label className="block text-sm">Description (optional)<textarea name="description" rows={2} maxLength={2000} className={fieldClass} /></label>
    {state.error && <p role="alert" className="text-red-800">{state.error}</p>}
    {state.success && <p role="status" className="text-emerald-800">{state.success}</p>}
    <SubmitButton label="Create project" />
  </form>;
}
