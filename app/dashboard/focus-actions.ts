'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/supabase/server';
import { validateId, validateOptionalSkillId, validateSessionNote } from '@/lib/validation';

export type FocusResult = { error?: string; saved?: boolean };
export async function transitionFocus(_state: FocusResult, form: FormData): Promise<FocusResult> {
  let id, revision, action, note, skill;
  try {
    id = validateId(form.get('session_id'));
    const raw = form.get('focus_revision');
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) throw new Error();
    revision = Number(raw);
    if (!Number.isSafeInteger(revision) || revision > 2147483647) throw new Error();
    action = form.get('focus_action');
    if (!['pause','resume','complete','abandon'].includes(String(action))) throw new Error();
    const value = form.get('note') ?? '';
    if (typeof value !== 'string') throw new Error();
    note = validateSessionNote(value);
    skill = validateOptionalSkillId(form.get('skill_id'));
  } catch { return { error: 'Invalid session request. Refresh and use a note of up to 200 characters.' }; }
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: 'Please sign in again before changing this session.' };
    const { error } = await supabase.rpc('transition_focus', { p_id: id, p_revision: revision, p_action: action, p_note: note, p_skill: skill });
    if (error) return { error: error.code === '40001' ? 'This session changed on another device. Refresh before trying again.' : 'Could not update focus. Refresh and try again; your note has been kept.' };
    for (const path of ['/dashboard','/today','/skills','/history','/review','/focus']) revalidatePath(path);
    return { saved: true };
  } catch { return { error: 'Could not connect. Your note has been kept. Try again.' }; }
}

export async function nextFocusPhase(_state: FocusResult, form: FormData): Promise<FocusResult> {
  let id;
  try { id = validateId(form.get('session_id')); } catch { return { error: 'Refresh before continuing this cycle.' }; }
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: 'Please sign in again.' };
    const { error } = await supabase.rpc('next_focus_phase', { p_id: id });
    if (error) return { error: 'Could not continue. A session may already be running; refresh before trying again.' };
    for (const path of ['/dashboard','/today','/focus']) revalidatePath(path);
    return { saved: true };
  } catch { return { error: 'Could not connect. Try again.' }; }
}
