'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/supabase/server';
import { liveCalendarPreview, type CalendarRead, type PreviewWindow } from '@/lib/smart-scheduler/live-preview';
import { validateId } from '@/lib/validation';
import { wallTimeInstants } from '@/lib/wall-time';
import { validDate } from '@/lib/calendar';

class CalendarAccessError extends Error {
  constructor(readonly code: 'disabled' | 'unauthenticated') {
    super(code);
  }
}

async function context(){
  if(process.env.FOCUS_SMART_CALENDAR_ENABLED!=='true')throw new CalendarAccessError('disabled');
  const supabase=await createClient();
  const {data:{user},error}=await supabase.auth.getUser();
  if (error && (error.status === 0 || (error.status ?? 0) >= 500 ||
    error.name === 'AuthRetryableFetchError')) throw error;
  if (error || !user) throw new CalendarAccessError('unauthenticated');
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
    if(error)return rpcCalendarFailure(error.code);
    if(!data)return calendarFailure('retry','Calendar preview is unavailable. Please retry.');
    if(!data.work_preferences||data.work_preferences.start!==window.start||data.work_preferences.end!==window.end)
      return calendarFailure('conflict','Save your work hours before generating a preview. If another device changed them, reload to see the saved hours.');
    try{return {preview:liveCalendarPreview(data as CalendarRead,user.id,window)};}
    catch(error){return calendarFailure('invalid',error instanceof Error?error.message:'Choose a valid planning window.');}
  }catch(error){return interruptedCalendarAction(error);}
}
export type CalendarSelection={
  timezone:string; revision:string;
  contract:{schema_version:string;input_fingerprint:string;base_version_id:string|null;work_revision:string};
  availability:{start_at:string;end_at:string}[];
  changes:{id:string;expected_updated_at:string;date:string;time:string;minutes:number}[];
};
export async function stageCalendarSelection(selection:CalendarSelection){
  try{
    const {supabase}=await context();
    let changes;
    let availability;
    try {
      if(!selection?.contract||selection.contract.schema_version!=='smart-calendar/v0.1'||typeof selection.contract.input_fingerprint!=='string'||typeof selection.contract.work_revision!=='string'||!/^sha256:[0-9a-f]{64}$/.test(selection.contract.input_fingerprint)||
        !/^[1-9]\d*$/.test(selection.contract.work_revision)||BigInt(selection.contract.work_revision)>BigInt('9223372036854775807'))return calendarFailure('invalid','Generate a new preview with your saved work hours.');
      if(selection.contract.base_version_id!==null)validateId(selection.contract.base_version_id);
      if(!selection||JSON.stringify(selection).length>50000||!Array.isArray(selection.changes)||selection.changes.length<1||selection.changes.length>50||
        new Set(selection.changes.map(x=>x.id)).size!==selection.changes.length||!/^(0|[1-9]\d*)$/.test(selection.revision)||
        BigInt(selection.revision)>BigInt('9223372036854775807')||!Array.isArray(selection.availability)||selection.availability.length<1||selection.availability.length>100)
        return calendarFailure('invalid','Select 1–50 changes and a valid work window.');
      changes=selection.changes.map(change=>{
        validateId(change.id);
        if(!validDate(change.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(change.time)||!Number.isInteger(change.minutes)||change.minutes<1||change.minutes>1440||
          typeof change.expected_updated_at!=='string'||change.expected_updated_at.length>64||!Number.isFinite(Date.parse(change.expected_updated_at)))throw new Error('invalid');
        const start=wallTimeInstants(change.date,change.time,selection.timezone).at(-1);
        if(start===undefined)throw new Error('gap');
        return {id:change.id,expected_updated_at:change.expected_updated_at,
          start_at:new Date(start).toISOString().replace('.000Z','Z'),end_at:new Date(start+change.minutes*60000).toISOString().replace('.000Z','Z')};
      });
      availability=selection.availability.map(w=>{
        const start=Date.parse(w.start_at),end=Date.parse(w.end_at);
        if(!Number.isFinite(start)||!Number.isFinite(end)||start%60000||end%60000||end<=start)throw new Error('window');
        return {start_at:new Date(start).toISOString().replace('.000Z','Z'),end_at:new Date(end).toISOString().replace('.000Z','Z')};
      });
    } catch {
      return calendarFailure('invalid','Check your dates, duration and timezone.');
    }
    const {data,error}=await supabase.rpc('stage_calendar_preview',{p_changes:changes,p_availability:availability,p_base_revision:selection.revision,p_timezone:selection.timezone,p_contract:selection.contract});
    return error?rpcCalendarFailure(error.code):{draftId:data as string};
  }catch(error){return interruptedCalendarAction(error);}
}

export async function saveCalendarWorkHours(start:string,end:string,expected:string,timezone:string){
  try{
    const {supabase}=await context();
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||start>=end||
      typeof expected!=='string'||!/^(0|[1-9]\d*)$/.test(expected)||BigInt(expected)>=BigInt('9223372036854775807'))return calendarFailure('invalid','Choose work hours ending after they start.');
    const {data,error}=await supabase.rpc('save_calendar_work_preferences',{p_start:start,p_end:end,p_expected:expected,p_timezone:timezone});
    if(error)return error.code==='40001'
      ?calendarFailure('conflict','Work hours changed on another device. Your edits are kept. Reload before saving.')
      :rpcCalendarFailure(error.code);
    revalidatePath('/calendar/smart-plan');
    return {preferences:data as {start:string;end:string;revision:string}};
  }catch(error){return interruptedCalendarAction(error);}
}
function calendarFailure(errorCode: 'invalid' | 'unauthenticated' | 'unavailable' | 'conflict' | 'retry' | 'disabled', error: string) {
  return { errorCode, error };
}

function rpcCalendarFailure(code?: string) {
  if (code === '40001' || code === '23P01') return calendarFailure('conflict', failure(code));
  if (code === '42501') return calendarFailure('unavailable', failure(code));
  if (code === '22023' || code === '22P02') return calendarFailure('invalid', failure('22023'));
  return calendarFailure('retry', failure());
}

function interruptedCalendarAction(error: unknown) {
  if (error instanceof CalendarAccessError) {
    return calendarFailure(error.code, error.code === 'disabled'
      ? 'Smart Calendar is unavailable in this environment.'
      : 'Sign in again to continue.');
  }
  return calendarFailure('retry', failure());
}

export async function confirmCalendarSelection(draftId: string, requestId: string) {
  try {
    validateId(draftId);
    validateId(requestId);
  } catch {
    return calendarFailure('invalid', 'The confirmation request is invalid. Generate a fresh preview.');
  }
  try {
    const { supabase } = await context();
    const { data, error } = await supabase.rpc('confirm_calendar_draft', { p_draft: draftId, p_request: requestId });
    if (error) return rpcCalendarFailure(error.code);
    for (const path of ['/calendar', '/calendar/smart-plan', '/today', '/inbox', '/review']) revalidatePath(path);
    return { receiptId: data.receipt_id as string };
  } catch (error) {
    return interruptedCalendarAction(error);
  }
}

export async function undoCalendarSelection(receiptId: string, requestId: string) {
  try {
    validateId(receiptId);
    validateId(requestId);
  } catch {
    return calendarFailure('invalid', 'The undo request is invalid. Reload to find the saved plan.');
  }
  try {
    const { supabase } = await context();
    const { error } = await supabase.rpc('undo_calendar_plan', { p_receipt: receiptId, p_request: requestId });
    if (error) return rpcCalendarFailure(error.code);
    for (const path of ['/calendar', '/calendar/smart-plan', '/today', '/inbox', '/review']) revalidatePath(path);
    return { success: true };
  } catch (error) {
    return interruptedCalendarAction(error);
  }
}

export async function setCalendarTaskLock(id:string,expected:string,expectedLock:string|null,locked:boolean){
  try{
    try { validateId(id); } catch { return calendarFailure('invalid','Reload the task before changing its lock.'); }
    if(typeof locked!=='boolean'||typeof expected!=='string'||expected.length>64||!Number.isFinite(Date.parse(expected))||
      (expectedLock!==null&&(typeof expectedLock!=='string'||expectedLock.length>64||!Number.isFinite(Date.parse(expectedLock)))))return calendarFailure('invalid','Reload the task before changing its lock.');
    const {supabase}=await context();
    const {data,error}=await supabase.rpc('set_calendar_task_lock',{p_id:id,p_expected:expected,p_expected_lock:expectedLock,p_locked:locked});
    if(error)return rpcCalendarFailure(error.code);
    revalidatePath('/calendar/smart-plan');
    return {locked:data.locked as boolean,lockVersion:data.lock_version as string|null};
  }catch(error){return interruptedCalendarAction(error);}
}
