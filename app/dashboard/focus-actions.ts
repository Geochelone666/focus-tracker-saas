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

/**
 * A background-finalized countdown must still accept its outcome and skill.
 * Timing fields are never part of the mutation. Owner RLS, completed status
 * and focus_revision enforce account isolation and stale-device rejection.
 */
export async function saveCompletedFocusOutcome(_state:FocusResult,form:FormData):Promise<FocusResult>{
 let id:string,revision:number,note:string|null,skill:string|null;
 try{
  id=validateId(form.get('session_id'));
  const raw=form.get('focus_revision');
  if(typeof raw!=='string'||!/^\d+$/.test(raw))throw new Error();
  revision=Number(raw);
  if(!Number.isSafeInteger(revision)||revision>2147483647)throw new Error();
  const value=form.get('note')??'';
  if(typeof value!=='string')throw new Error();
  note=validateSessionNote(value);
  skill=validateOptionalSkillId(form.get('skill_id'));
 }catch{return{error:'Choose a valid skill and a note of up to 200 characters. Refresh if the session changed.'};}
 try{
  const supabase=await createClient();
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)return{error:'Please sign in again before saving the outcome.'};
  const {data,error}=await supabase.from('focus_sessions')
   .update({note,skill_id:skill})
   .eq('id',id).eq('user_id',user.id)
   .eq('focus_status','completed').not('ended_at','is',null)
   .eq('focus_revision',revision)
   .select('id').maybeSingle();
  if(error)return{error:'Could not save outcome. Confirm the skill belongs to your account and try again.'};
  if(!data)return{error:'This session changed on another device or is not completed. Refresh before trying again.'};
  for(const path of ['/dashboard','/today','/skills','/history','/review'])revalidatePath(path);
  return{saved:true};
 }catch{return{error:'Could not connect. Your note is still in this form. Try again.'};}
}
