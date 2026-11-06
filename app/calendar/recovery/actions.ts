'use server';
import {revalidatePath} from 'next/cache';
import {createClient} from '@/supabase/server';
import {validateId} from '@/lib/validation';
export type RecoveryResult={error?:string;revision?:string;success?:string};
export async function saveRecoveryContext(_previous:RecoveryResult,form:FormData):Promise<RecoveryResult>{
 if(process.env.FOCUS_EXECUTION_RECOVERY_ENABLED!=='true')return {error:'Recovery planning is not enabled.'};
 try{
  const id=validateId(form.get('id')),expected=form.get('expected_updated_at'),raw=form.get('remaining_minutes'),note=form.get('resume_note');
  if(typeof expected!=='string'||expected.length>64||!Number.isFinite(Date.parse(expected))||typeof raw!=='string'||!/^\d{0,4}$/.test(raw)||typeof note!=='string'||note.length>2000)return {error:'Enter a remaining estimate of 1–1440 minutes, or leave it unknown, and a note up to 2000 characters.'};
  const minutes=raw?Number(raw):null;
  if(minutes!==null&&(minutes<1||minutes>1440))return {error:'Use 1–1440 minutes or leave the estimate unknown. Mark the task complete separately.'};
  const supabase=await createClient();const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)return {error:'Sign in again to save your context.'};
  const {data,error}=await supabase.rpc('save_task_recovery',{p_id:id,p_expected:expected,p_remaining:minutes,p_note:note});
  if(error)return {error:error.code==='40001'?'This task changed on another device. Reload before saving; your text has been kept.':'Could not save this task. Check your account and try again.'};
  revalidatePath('/calendar/recovery');
  return {revision:data as string,success:'Recovery context saved. Task times and focus records are unchanged.'};
 }catch{return {error:'Could not connect. Your context is kept; try again.'};}
}
