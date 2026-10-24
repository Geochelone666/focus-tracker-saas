export type Plan={id:string;title:string;scheduled_date:string|null;scheduled_time:string|null;notes:string|null;is_done:boolean;priority:string;estimated_minutes:number|null;project_id:string|null;skill_id:string|null;deleted_at:string|null;updated_at:string};
export type Draft={title:string;date:string;time:string;notes:string;priority:string;estimate:string};
export const PLAN_COLUMNS='id,title,scheduled_date,scheduled_time,notes,is_done,priority,estimated_minutes,project_id,skill_id,deleted_at,updated_at';
export function localDay(zone:string,now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 return ['year','month','day'].map(type=>parts.find(p=>p.type===type)!.value).join('-');
}
export function draftFor(plan?:Plan):Draft{return {title:plan?.title??'',date:plan?.scheduled_date??'',time:plan?.scheduled_time?.slice(0,5)??'',notes:plan?.notes??'',priority:plan?.priority??'normal',estimate:plan?.estimated_minutes?.toString()??''};}
export function parseDraft(draft:Draft){
 const title=draft.title.trim(),date=draft.date.trim(),time=draft.time.trim(),notes=draft.notes.trim(),estimate=draft.estimate.trim();
 if(!title||title.length>120||notes.length>2000)throw new Error('Enter a title of 1–120 characters and notes of up to 2000 characters.');
 if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<'0002-01-01'||date>'9998-12-31'))throw new Error('Use a valid date: YYYY-MM-DD.');
 if(time&&(!date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))throw new Error('A time needs a date. Use 24-hour time: HH:MM.');
 if(!['low','normal','high'].includes(draft.priority))throw new Error('Choose a valid priority.');
 if(estimate&&(!/^\d+$/.test(estimate)||Number(estimate)<1||Number(estimate)>1440))throw new Error('Estimated minutes must be between 1 and 1440.');
 return {title,scheduled_date:date||null,scheduled_time:time||null,notes:notes||null,priority:draft.priority,estimated_minutes:estimate?Number(estimate):null};
}
