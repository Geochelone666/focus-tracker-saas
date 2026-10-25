import { validDate } from './calendar';

/** Caller supplies a validated IANA zone; resolves DST folds in UTC order. */
/** Return real instants for a wall time: zero in a DST gap; two in a fold, earlier first. */
export function wallTimeInstants(day: string, time: string, zone: string): number[] {
  if(!validDate(day)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return [];
  const nominal=Date.parse(`${day}T${time}:00Z`);
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const wall=(instant:number)=>{const parts=formatter.formatToParts(new Date(instant));const p=(key:string)=>parts.find(v=>v.type===key)!.value;return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}`;};
  const offset=(instant:number)=>Date.parse(wall(instant)+':00Z')-instant;
  return [...new Set([-36,-14,0,14,36].map(h=>offset(nominal+h*3600000)))].map(delta=>nominal-delta).filter(instant=>wall(instant)===`${day}T${time}`).sort((a,b)=>a-b);
}
