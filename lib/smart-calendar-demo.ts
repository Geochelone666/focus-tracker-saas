
export type Slot = {day:string;start:string;minutes:number};
export type Suggestion = {id:string;title:string;group:string;current:Slot|null;proposed:Slot|null;reasonCode:string;reason:string;locked?:boolean};
export type Decision = {accepted:Record<string,boolean>;locked:Record<string,boolean>;manual:Record<string,Slot>};
export const DAY='2026-11-04',ZONE='America/Toronto';
const slot=(start:string,minutes:number):Slot=>({day:DAY,start,minutes});
export const FIXED=[{id:'seminar',title:'Fixed seminar',slot:slot('11:00',60)},{id:'lab',title:'Fixed laboratory',slot:slot('15:00',60)}];
export const EXAMPLE:Suggestion[]=[
 {id:'abstract',title:'Draft research abstract',group:'Research · High',current:slot('13:00',60),proposed:slot('09:00',60),reasonCode:'PRIORITY_FIRST',reason:'High-priority work suggested for the first available hour.'},
 {id:'reading',title:'Read case materials',group:'Reading · Normal',current:slot('09:00',60),proposed:slot('10:00',60),reasonCode:'MAKE_ROOM',reason:'Moved to reserve early time for the abstract.'},
 {id:'physics',title:'Physics problem set',group:'Coursework · High',current:slot('10:00',90),proposed:slot('11:15',60),reasonCode:'CONFLICT_REVIEW',reason:'This deliberately overlaps a fixed seminar to demonstrate conflict handling.'},
 {id:'journal',title:'Review journal notes',group:'Research · Low',current:null,proposed:slot('12:30',30),reasonCode:'SHORT_WINDOW',reason:'A short opening fits this estimated duration.'},
 {id:'slides',title:'Prepare presentation slides',group:'Coursework · Normal',current:slot('14:00',60),proposed:slot('14:00',60),reasonCode:'USER_LOCK',reason:'Original time preserved.',locked:true},
 {id:'dataset',title:'Clean experiment dataset',group:'Coursework · Low',current:null,proposed:null,reasonCode:'NO_WINDOW',reason:'No suitable slot was found in this fixed example.'}
];
export const initialDecisions=():Decision=>({accepted:Object.fromEntries(EXAMPLE.map(x=>[x.id,true])),locked:Object.fromEntries(EXAMPLE.map(x=>[x.id,!!x.locked])),manual:{}});
export function selectedSlot(x:Suggestion,d:Decision):Slot|null{
 if(d.locked[x.id]||d.accepted[x.id]===false)return x.current;
 return d.manual[x.id]??x.proposed;
}
export const formatSlot=(x:Slot|null)=>x?x.start+' · '+x.minutes+' min':'Unscheduled';
export const sameSlot=(a:Slot|null,b:Slot|null)=>a===null||b===null?a===b:a.day===b.day&&a.start===b.start&&a.minutes===b.minutes;
const minute=(x:string)=>{const [h,m]=x.split(':').map(Number);return h*60+m;};
const overlaps=(a:Slot,b:Slot)=>a.day===b.day&&minute(a.start)<minute(b.start)+b.minutes&&minute(b.start)<minute(a.start)+a.minutes;
export function conflictMap(items:Suggestion[],d:Decision):Record<string,string[]>{
 const errors:Record<string,string[]>={};
 for(const task of items){const s=selectedSlot(task,d);if(!s)continue;const clashes:string[]=[];
  if(minute(s.start)<540||minute(s.start)+s.minutes>1020)clashes.push('Outside available hours 09:00–17:00');
  for(const fixed of FIXED)if(overlaps(s,fixed.slot))clashes.push('Overlaps '+fixed.title);
  for(const other of items)if(other.id!==task.id){const target=selectedSlot(other,d);if(target&&overlaps(s,target))clashes.push('Overlaps '+other.title);}
  if(clashes.length)errors[task.id]=clashes;
 }
 return errors;
}
