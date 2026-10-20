'use client';

import { useActionState, useEffect, useState } from 'react';
import { createProject, saveReflection } from '@/app/planning/actions';
import { SubmitButton } from './submit-button';
import { fieldClass } from './plan-form';

export function ReflectionForm({ note }: { note: string }) {
  const [state, action] = useActionState(saveReflection, {});
  const [value, setValue] = useState(note);
  useEffect(() => setValue(note), [note]);
  return <form action={action} className="space-y-3">
    <label className="block text-sm">What went well? What would you change tomorrow?<textarea name="note" maxLength={2000} rows={3} value={value} onChange={event => setValue(event.target.value)} className={fieldClass} /></label>
    {state.error && <p role="alert" className="text-red-800">{state.error}</p>}
    {state.success && <p role="status" className="text-emerald-800">{state.success}</p>}
    <SubmitButton label="Save reflection" />
  </form>;
}
export function ProjectForm() {
  const [state, action] = useActionState(createProject, {});
  const [draft, setDraft] = useState({ name: '', date: '', description: '' });
  useEffect(() => { if (state.savedAt) setDraft({ name: '', date: '', description: '' }); }, [state.savedAt]);
  return <form action={action} className="space-y-3">
    <label className="block text-sm">Project or goal<input name="name" value={draft.name} onChange={event => setDraft({...draft,name:event.target.value})} required maxLength={120} className={fieldClass} placeholder="Learn conversational French" /></label>
    <label className="block text-sm">Target date (optional)<input name="target_date" value={draft.date} onChange={event => setDraft({...draft,date:event.target.value})} type="date" min="0002-01-01" max="9998-12-31" className={fieldClass} /></label>
    <label className="block text-sm">Description (optional)<textarea name="description" value={draft.description} onChange={event => setDraft({...draft,description:event.target.value})} rows={2} maxLength={2000} className={fieldClass} /></label>
    {state.error && <p role="alert" className="text-red-800">{state.error}</p>}
    {state.success && <p role="status" className="text-emerald-800">{state.success}</p>}
    <SubmitButton label="Create project" />
  </form>;
}
