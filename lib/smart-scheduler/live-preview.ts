import { addDays } from '../planning';
import { validDate } from '../calendar';
import { wallTimeInstants } from '../wall-time';
import { previewSmartCalendar, type FocusScheduleRow, type SmartCalendarSnapshotV01 } from './focus-adapter';
export type CalendarRead = {
  user_id:string; captured_at:string; timezone:string; revision:string;
  version_id:string|null; undo_receipt_id:string|null; has_active_focus:boolean;
  schedules:(FocusScheduleRow & {title:string})[]; accepted_ids:string[]; locked_ids:string[]; lock_versions?:Record<string,string>;
};
export type PreviewWindow = {date:string; days:number; start:string; end:string};
export function liveCalendarPreview(read:CalendarRead, owner:string, window:PreviewWindow) {
  if(read.user_id!==owner)throw new Error('Calendar owner mismatch.');
  if(read.schedules.some(row=>row.user_id!==owner))throw new Error('Calendar owner mismatch.');
  if(read.schedules.length>500)throw new Error('This preview supports up to 500 open tasks. Complete or archive tasks first.');
  if(read.has_active_focus)throw new Error('Finish or abandon your active focus session before planning.');
  if(!validDate(window.date)||window.date<'0002-01-01'||window.date>'9998-01-01'||!Number.isInteger(window.days)||window.days<1||window.days>14||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(window.end)||window.start>=window.end)
    throw new Error('Choose 1–14 days and a work window ending after it starts.');
  const instant=(day:string,time:string)=>{
    const value=wallTimeInstants(day,time,read.timezone).at(-1);
    if(value===undefined)throw new Error('A selected time does not exist in your timezone. Choose another work window.');
    return value;
  };
  const availability=Array.from({length:window.days},(_,i)=>{
    const day=addDays(window.date,i);
    return {user_id:owner,start_at:new Date(instant(day,window.start)).toISOString(),end_at:new Date(instant(day,window.end)).toISOString()};
  });
  const locked=new Set(read.locked_ids),accepted=new Set(read.accepted_ids);
  const snapshot:SmartCalendarSnapshotV01={
    schema_version:'smart-calendar/v0.1',user_id:owner,timezone:read.timezone,captured_at:read.captured_at,
    window:{start_at:availability[0].start_at,end_at:availability.at(-1)!.end_at},base_version_id:read.version_id,
    schedules:read.schedules.filter(row=>!locked.has(row.id)||!!row.scheduled_time),availability,busy_intervals:[],focus_sessions:[],
    accepted_blocks:read.schedules.filter(row=>accepted.has(row.id)&&row.scheduled_date&&row.scheduled_time&&row.estimated_minutes).map(row=>{
      const start=instant(row.scheduled_date!,row.scheduled_time!.slice(0,5));
      return {user_id:owner,schedule_id:row.id,version_id:read.version_id!,expected_updated_at:row.updated_at,
        start_at:new Date(start).toISOString(),end_at:new Date(start+row.estimated_minutes!*60000).toISOString(),is_locked:locked.has(row.id)};
    }),policy:{breakMinutes:5,defaultEstimateMinutes:30},
  };
  const {output}=previewSmartCalendar(snapshot);
  return {output,availability,timezone:read.timezone,revision:read.revision,
    tasks:calendarTaskChoices(read)};
}
export type LivePreview = ReturnType<typeof liveCalendarPreview>;

export function calendarTaskChoices(read:CalendarRead){
  return read.schedules.map(row=>({id:row.id,title:row.title,date:row.scheduled_date,time:row.scheduled_time,minutes:row.estimated_minutes,
    locked:read.locked_ids.includes(row.id),revision:row.updated_at,lockVersion:read.lock_versions?.[row.id]??null}));
}
export type CalendarTaskChoice=ReturnType<typeof calendarTaskChoices>[number];
