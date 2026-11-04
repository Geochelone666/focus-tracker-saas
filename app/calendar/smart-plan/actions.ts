'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/supabase/server';
import { liveCalendarPreview, type CalendarRead, type PreviewWindow } from '@/lib/smart-scheduler/live-preview';
import { validateId } from '@/lib/validation';
import { wallTimeInstants } from '@/lib/wall-time';
import { validDate } from '@/lib/calendar';

async function context(){
  if(process.env.FOCUS_SMART_CALENDAR_ENABLED!=='true')throw new Error('disabled');
  const supabase=await createClient();
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user)throw new Error('unauthorized');
  return {supabase,user};
}
function failure(code?:string){
  if(code==='40001')return 'Your tasks or plan changed. Generate a fresh preview before saving.';
  if(code==='23P01')return 'A task is locked, focus is active, or a block conflicts. Adjust your selection or generate a fresh preview.';
  if(code==='22023')return 'Check the work window, task duration, deadline and five-minute breaks.';
  if(code==='42501')return 'This plan is unavailable for your account. Sign in and generate a new preview.';
  return 'Could not complete the request. Your selection is kept. Retry to check the same request safely.';
}
export async function generateCalendarPreview(window:PreviewWindow){
  try{
    const {supabase,user}=await context();
    const {data,error}=await supabase.rpc('calendar_preview_snapshot');
    if(error||!data)return {error:'Calendar preview is unavailable. Check that the experimental migrations are installed.'};
    try{return {preview:liveCalendarPreview(data as CalendarRead,user.id,window)};}
    catch(error){return {error:error instanceof Error?error.message:'Choose a valid planning window.'};}
  }catch{return {error:'Sign in to an enabled Smart Calendar environment to continue.'};}
}
export type CalendarSelection={
  timezone:string; revision:string;
  availability:{start_at:string;end_at:string}[];
  changes:{id:string;expected_updated_at:string;date:string;time:string;minutes:number}[];
};
export async function stageCalendarSelection(selection:CalendarSelection){
  try{
    const {supabase}=await context();
    if(!selection||JSON.stringify(selection).length>50000||!Array.isArray(selection.changes)||selection.changes.length<1||selection.changes.length>50||
      new Set(selection.changes.map(x=>x.id)).size!==selection.changes.length||!/^(0|[1-9]\d*)$/.test(selection.revision)||
      BigInt(selection.revision)>BigInt('9223372036854775807')||!Array.isArray(selection.availability)||selection.availability.length<1||selection.availability.length>100)
      return {error:'Select 1–50 changes and a valid work window.'};
    const changes=selection.changes.map(change=>{
      validateId(change.id);
      if(!validDate(change.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(change.time)||!Number.isInteger(change.minutes)||change.minutes<1||change.minutes>1440||
        typeof change.expected_updated_at!=='string'||change.expected_updated_at.length>64||!Number.isFinite(Date.parse(change.expected_updated_at)))throw new Error('invalid');
      const start=wallTimeInstants(change.date,change.time,selection.timezone).at(-1);
      if(start===undefined)throw new Error('gap');
      return {id:change.id,expected_updated_at:change.expected_updated_at,
        start_at:new Date(start).toISOString().replace('.000Z','Z'),end_at:new Date(start+change.minutes*60000).toISOString().replace('.000Z','Z')};
    });
    const availability=selection.availability.map(w=>{
      const start=Date.parse(w.start_at),end=Date.parse(w.end_at);
      if(!Number.isFinite(start)||!Number.isFinite(end)||start%60000||end%60000||end<=start)throw new Error('window');
      return {start_at:new Date(start).toISOString().replace('.000Z','Z'),end_at:new Date(end).toISOString().replace('.000Z','Z')};
    });
    const {data,error}=await supabase.rpc('stage_calendar_preview',{p_changes:changes,p_availability:availability,p_base_revision:selection.revision,p_timezone:selection.timezone});
    return error?{error:failure(error.code)}:{draftId:data as string};
  }catch{return {error:'Check your dates, duration and timezone. Sign in again if your session expired.'};}
}
export async function confirmCalendarSelection(draftId:string,requestId:string){
  try{
    validateId(draftId);validateId(requestId);
    const {supabase}=await context();
    const {data,error}=await supabase.rpc('confirm_calendar_draft',{p_draft:draftId,p_request:requestId});
    if(error)return {error:failure(error.code)};
    for(const path of ['/calendar','/calendar/smart-plan','/today','/inbox','/review'])revalidatePath(path);
    return {receiptId:data.receipt_id as string};
  }catch{return {error:failure()};}
}
export async function undoCalendarSelection(receiptId:string,requestId:string){
  try{
    validateId(receiptId);validateId(requestId);
    const {supabase}=await context();
    const {error}=await supabase.rpc('undo_calendar_plan',{p_receipt:receiptId,p_request:requestId});
    if(error)return {error:failure(error.code)};
    for(const path of ['/calendar','/calendar/smart-plan','/today','/inbox','/review'])revalidatePath(path);
    return {success:true};
  }catch{return {error:failure()};}
}
