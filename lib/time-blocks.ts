import { validDate } from './calendar';
import { getMidnightInTimeZone } from './analytics';
import { addDays, timezone, type Schedule } from './planning';
/** Return real instants for a wall time: zero in a DST gap; two in a fold, earlier first. */
export function wallTimeInstants(day: string, time: string, zone: string): number[] {
  if(!validDate(day)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return [];
  const nominal=Date.parse(`${day}T${time}:00Z`);
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone(zone),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const wall=(instant:number)=>{const parts=formatter.formatToParts(new Date(instant));const p=(key:string)=>parts.find(v=>v.type===key)!.value;return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}`;};
  const offset=(instant:number)=>Date.parse(wall(instant)+':00Z')-instant;
  return [...new Set([-36,-14,0,14,36].map(h=>offset(nominal+h*3600000)))].map(delta=>nominal-delta).filter(instant=>wall(instant)===`${day}T${time}`).sort((a,b)=>a-b);
}
export function taskInterval(task: Schedule,zone:string) {
  if(!task.scheduled_date||!task.scheduled_time||!task.estimated_minutes||task.deleted_at)return null;
  const starts=wallTimeInstants(task.scheduled_date,task.scheduled_time.slice(0,5),zone);
  if(!starts.length)return null;
  return {start:starts[0],end:starts[0]+task.estimated_minutes*60000,ambiguous:starts.length>1};
}
export function conflictingTasks(task:Schedule,others:Schedule[],zone:string) {
  const interval=taskInterval(task,zone);if(!interval)return [];
  return others.filter(other=>{if(other.id===task.id||other.is_done)return false;const next=taskInterval(other,zone);return next&&interval.start<next.end&&next.start<interval.end;});
}
export function timestampLabel(instant:number,zone:string) {return new Intl.DateTimeFormat('en-GB',{timeZone:timezone(zone),hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(instant));}

/** Split overnight blocks into each displayed local day; lanes keep overlaps visible. */
export function dayBlockLayout(tasks:Schedule[],day:string,zone:string) {
  const midnight=(value:string)=>{
    // Use the existing DST-midnight implementation, including midnight transitions.
    const date=new Date(`${value}T00:00:00Z`);
    return getMidnightInTimeZone(date,zone).getTime();
  };
  const from=midnight(day),until=midnight(addDays(day,1));
  const minute=(instant:number)=>{const label=timestampLabel(instant,zone);return Number(label.slice(0,2))*60+Number(label.slice(3,5));};
  const entries=tasks.map(task=>({task,interval:taskInterval(task,zone)})).filter(entry=>entry.interval&&entry.interval.start<until&&entry.interval.end>from)
    .sort((a,b)=>a.interval!.start-b.interval!.start||a.task.id.localeCompare(b.task.id));
  const ends:number[]=[];
  const segments=entries.map(({task,interval})=>{
    const start=Math.max(from,interval!.start),end=Math.min(until,interval!.end);
    const top=interval!.start<from?0:minute(start),bottom=interval!.end>=until?1440:minute(end);
    // Folded wall labels can go backwards; retain a visible labelled block in that hour.
    const height=Math.max(15,bottom-top);
    let lane=ends.findIndex(value=>value<=top);if(lane<0)lane=ends.length;ends[lane]=top+height;
    return {task,interval:interval!,top,height,lane,continued:interval!.start<from,carries:interval!.end>until};
  });
  return {segments,lanes:Math.max(1,ends.length),dst:until-from!==86400000};
}
