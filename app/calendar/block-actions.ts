'use server';
import { revalidatePath } from 'next/cache';
import { planningContext } from '@/lib/planning-data';
import { textField } from '@/lib/planning';
import { validDate } from '@/lib/calendar';
import { validateId } from '@/lib/validation';
export type BlockResult={error?:string;success?:string};
export async function saveTimeBlock(_state:BlockResult,form:FormData):Promise<BlockResult>{
 let id,date,time,minutes,expected,revisions;
 try{
  id=validateId(form.get('id'));expected=textField(form,'expected_updated_at',64);if(!expected)throw new Error();
  date=textField(form,'date',10)||null;time=textField(form,'time',5)||null;
  const raw=textField(form,'minutes',4);minutes=raw?Number(raw):null;
  if((date&&(!validDate(date)||date<'0002-01-01'||date>'9998-12-31'))||(time&&(!date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))||(minutes!==null&&(!Number.isInteger(minutes)||minutes<1||minutes>1440)))throw new Error();
  revisions=JSON.parse(textField(form,'series_revisions',20000)||'{}');
 }catch{return{error:'Choose a valid date, time and duration of 1–1440 minutes. Refresh if the task changed.'};}
 try{
  const {supabase}=await planningContext();
  const {error}=await supabase.rpc('mutate_schedule',{p_id:id,p_expected:expected,p_patch:{scheduled_date:date,scheduled_time:time,estimated_minutes:minutes},p_future:form.get('scope')==='future',p_revisions:revisions});
  if(error)return{error:error.code==='40001'?'This task or series changed on another device. Reload before saving.':"Could not save. Check ownership and choose an existing local time; clocks may skip this time on this date."};
  for(const path of ['/calendar','/today','/inbox','/review'])revalidatePath(path);
  return{success:date?'Time block saved.':'Moved to Inbox.'};
 }catch{return{error:'Connection failed. Your input is kept. Try again.'};}
}
