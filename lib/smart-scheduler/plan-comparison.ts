import type { LivePreview } from './live-preview';
import { wallTimeInstants } from '../wall-time';
import { validDate } from '../calendar';
import { addDays } from '../planning';
import { getMidnightInTimeZone } from '../analytics';

export type PlanEdit={date:string;time:string;minutes:number;selected:boolean};
export type ComparisonBlock={id:string;title:string;start:number;end:number;locked:boolean;changed:boolean};
function interval(date:string|null,time:string|null,minutes:number|null,zone:string){
  if(!date||!time||!validDate(date)||!/^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(time)||!Number.isInteger(minutes)||minutes!<1||minutes!>1440)return null;
  const start=wallTimeInstants(date,time.slice(0,5),zone).at(-1);
  return start===undefined?null:{start,end:start+minutes!*60000};
}
/** Compare only the changes actually selected, including manual edits. Unselected tasks retain their times. */
export function compareCalendarPlan(preview:LivePreview,edits:Record<string,PlanEdit>){
  const before:ComparisonBlock[]=[],after:ComparisonBlock[]=[],issues:Record<string,string[]>={};
  const warn=(id:string,message:string)=>{(issues[id]??=[]).push(message);};
  for(const task of preview.tasks){
    const original=interval(task.date,task.time,task.minutes,preview.timezone);
    if(original)before.push({id:task.id,title:task.title,...original,locked:task.locked,changed:false});
    const edit=edits[task.id],selected=edit?.selected&&!task.locked;
    const proposed=selected?interval(edit.date,edit.time,edit.minutes,preview.timezone):original;
    if(selected&&!proposed)warn(task.id,'Choose an existing local time and a duration of 1–1440 minutes.');
    if(!proposed)continue;
    const changed=!!selected&&(!original||original.start!==proposed.start||original.end!==proposed.end);
    after.push({id:task.id,title:task.title,...proposed,locked:task.locked,changed});
    if(changed&&!preview.availability.some(w=>Date.parse(w.start_at)<=proposed.start&&Date.parse(w.end_at)>=proposed.end+300000))
      warn(task.id,'Outside your work window or missing the five-minute break.');
  }
  for(let i=0;i<after.length;i++)for(let j=i+1;j<after.length;j++){
    const a=after[i],b=after[j];
    if((a.changed||b.changed)&&a.start<b.end+300000&&b.start<a.end+300000){
      if(a.changed)warn(a.id,`Conflicts with ${b.title}, including the required break.`);
      if(b.changed)warn(b.id,`Conflicts with ${a.title}, including the required break.`);
    }
  }
  return {before,after,issues};
}
/** Clip by real account-local midnight, preserving 23/25-hour days and overnight blocks. */
export function calendarComparisonDay(blocks:ComparisonBlock[],date:string,zone:string){
  const start=getMidnightInTimeZone(new Date(`${date}T00:00:00Z`),zone).getTime();
  const end=getMidnightInTimeZone(new Date(`${addDays(date,1)}T00:00:00Z`),zone).getTime();
  const lanes:number[]=[];
  const segments=blocks.filter(b=>b.start<end&&b.end>start).sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id)).map(block=>{
    const begins=Math.max(start,block.start),ends=Math.min(end,block.end);
    let lane=lanes.findIndex(until=>until<=begins);
    if(lane<0)lane=lanes.length;
    lanes[lane]=ends;
    return {...block,offsetMinutes:(begins-start)/60000,minutes:(ends-begins)/60000,lane};
  });
  return {start,end,minutes:(end-start)/60000,lanes:Math.max(1,lanes.length),segments};
}
