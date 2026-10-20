'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { planningContext } from '@/lib/planning-data';
import { addDays, parsePlan, recurrenceDates, textField, timezone } from '@/lib/planning';
import { validateId } from '@/lib/validation';
import { validDate } from '@/lib/calendar';

export type PlanState = { error?: string; success?: string; savedAt?: number };
function refresh(path = '/today') { revalidatePath(path); }
function destination(form: FormData) {
  const value = form.get('return_to');
  return typeof value === 'string' && ['/today','/inbox','/calendar','/projects','/review'].includes(value) ? value : '/today';
}
function failure(path: string, message: string): never { redirect(path + '?error=' + encodeURIComponent(message)); }

export async function createPlan(_state: PlanState, form: FormData): Promise<PlanState> {
  let plan, dates;
  try {
    plan = parsePlan(form);
    const repeat = textField(form, 'repeat', 10) || 'none';
    dates = recurrenceDates(plan.scheduled_date, repeat, Number(textField(form, 'occurrences', 2) || '12'));
  } catch { return { error: 'Enter a title, valid optional date/time, and an estimate of 1–1440 minutes. Repeats need a date and 2–52 occurrences.' }; }
  const { supabase, user } = await planningContext();
  const series = dates.length > 1 ? randomUUID() : null;
  try {
    const { error } = await supabase.from('schedules').insert(dates.map(date => ({ ...plan, scheduled_date: date, series_id: series, user_id: user.id })));
    if (error) return { error: 'Could not save. Please check your project/skill selection and try again.' };
  } catch { return { error: 'Could not connect. Your input has been kept; please try again.' }; }
  refresh(destination(form));
  if (destination(form) === '/calendar') redirect(plan.scheduled_date ? '/calendar?date=' + plan.scheduled_date : '/inbox');
  return { success: dates.length > 1 ? `Created ${dates.length} occurrences. Each can be completed separately.` : 'Saved. Your plan is ready.', savedAt: Date.now() };
}

export async function editPlan(id: string, _state: PlanState, form: FormData): Promise<PlanState> {
  let plan;
  try { id = validateId(id); plan = parsePlan(form); }
  catch { return { error: 'Check the title, date, optional time, and estimated minutes.' }; }
  const { supabase } = await planningContext();
  try {
    const { error, data } = await supabase.rpc('edit_schedule', {
      p_id: id, p_title: plan.title, p_date: plan.scheduled_date, p_time: plan.scheduled_time,
      p_notes: plan.notes, p_priority: plan.priority, p_estimate: plan.estimated_minutes,
      p_energy: plan.energy, p_project: plan.project_id, p_skill: plan.skill_id,
      p_future: form.get('scope') === 'future'
    });
    if (error || !data) return { error: 'Could not update this plan. Check the date and project/skill selection, then retry.' };
  } catch { return { error: 'Could not connect. Your changes have been kept; please try again.' }; }
  refresh(destination(form));
  if (destination(form) === '/calendar') redirect(plan.scheduled_date ? '/calendar?date=' + plan.scheduled_date : '/inbox');
  return { success: 'Changes saved.', savedAt: Date.now() };
}

export async function changePlan(id: string, operation: 'complete' | 'reopen' | 'trash' | 'restore' | 'today' | 'tomorrow' | 'inbox', form: FormData) {
  const path = destination(form);
  try { id = validateId(id); } catch { failure(path, 'Invalid plan. Please refresh.'); }
  const { supabase, user, today } = await planningContext();
  let patch: Record<string, unknown>;
  switch (operation) {
    case 'complete': patch = { is_done: true, completed_at: new Date().toISOString() }; break;
    case 'reopen': patch = { is_done: false, completed_at: null }; break;
    case 'trash': patch = { deleted_at: new Date().toISOString() }; break;
    case 'restore': patch = { deleted_at: null }; break;
    case 'inbox': patch = { scheduled_date: null, scheduled_time: null }; break;
    case 'today': case 'tomorrow': {
      let reason;
      try { reason = textField(form, 'reason', 200) || null; } catch { failure(path, 'Use a reason of up to 200 characters.'); }
      patch = { scheduled_date: operation === 'today' ? today : addDays(today, 1), deferral_reason: reason };
      break;
    }
    default: failure(path, 'Unknown operation.');
  }
  const { data, error } = await supabase.from('schedules').update(patch).eq('id', id).eq('user_id', user.id).select('id').maybeSingle();
  if (error || !data) failure(path, 'Could not update the plan. Please refresh and try again.');
  refresh(path);
}

export async function saveReflection(_state: PlanState, form: FormData): Promise<PlanState> {
  let note;
  try { note = textField(form, 'note', 2000); } catch { return { error: 'Keep your reflection under 2000 characters.' }; }
  const { supabase, user, today } = await planningContext();
  const { error } = await supabase.from('daily_reflections').upsert({ user_id: user.id, day: today, note, updated_at: new Date().toISOString() });
  if (error) return { error: 'Could not save your reflection. Please try again.' };
  refresh();
  return { success: 'Reflection saved.', savedAt: Date.now() };
}

export async function createProject(_state: PlanState, form: FormData): Promise<PlanState> {
  let name, description, date;
  try {
    name = textField(form, 'name', 120); description = textField(form, 'description', 2000) || null;
    date = textField(form, 'target_date', 10) || null;
    if (!name || (date && !validDate(date))) throw new Error();
  } catch { return { error: 'Enter a project name (up to 120 characters) and a valid optional target date.' }; }
  const { supabase, user } = await planningContext();
  const { error } = await supabase.from('projects').insert({ user_id: user.id, name, description, target_date: date });
  if (error) return { error: 'Could not create this project. Please try again.' };
  refresh('/projects'); return { success: 'Project created.', savedAt: Date.now() };
}

export async function toggleProject(id: string, done: boolean) {
  try { id = validateId(id); if (typeof done !== 'boolean') throw new Error(); } catch { failure('/projects','Invalid project.'); }
  const { supabase, user } = await planningContext();
  const { error } = await supabase.from('projects').update({ is_done: done }).eq('id', id).eq('user_id', user.id);
  if (error) failure('/projects', 'Could not update the project.');
  refresh('/projects');
}

export async function saveTimezone(form: FormData) {
  let zone;
  try { zone = textField(form, 'timezone', 100); if (!zone || timezone(zone) !== zone) throw new Error(); }
  catch { failure('/settings','Choose a valid IANA timezone, such as America/Toronto.'); }
  const { supabase, user } = await planningContext();
  const { error } = await supabase.from('profiles').upsert({ user_id: user.id, timezone: zone, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) failure('/settings', 'Could not save your timezone.');
  revalidatePath('/', 'layout');
  redirect('/settings?saved=1');
}
