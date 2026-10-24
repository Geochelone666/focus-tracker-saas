import { addDays } from './planning';
import { validDate } from './calendar';
import type { createClient } from '../supabase/server';
export type ReportDay={day:string;focus_seconds:number;break_seconds:number;planned_minutes:number|null;completed_tasks:number};
export type ReportTask={id:string;title:string;scheduled_date:string|null;deadline:string|null;estimated_minutes:number|null;actual_seconds:number|null;is_done:boolean;deferral_count:number};
export type AnalyticsReport={days:ReportDay[];tasks:ReportTask[];projects:{id:string|null;name:string;seconds:number}[];skills:{id:string|null;name:string;seconds:number}[];task_count:number;estimate_fit_percent:number|null;deferred_tasks:number;overdue_tasks:number;legacy_sessions:number};
export function reportRange(params:{range?:string;from?:string;to?:string;page?:string},today:string){
 const custom=params.range==='custom',days=params.range==='30'?30:7;
 let from=custom?params.from??'':addDays(today,1-days),to=custom?params.to??'':today;
 const valid=validDate(from)&&validDate(to)&&from>='0002-01-01'&&to<='9998-12-31'&&to>=from&&(Date.parse(to)-Date.parse(from))/86400000<=365;
 if(!valid){from=addDays(today,-6);to=today;}
 const requested=Number(params.page??'1'),page=Number.isSafeInteger(requested)&&requested>0&&requested<=100000?requested:1;
 return{from,to,page,range:custom?'custom':String(days),error:valid?undefined:'Choose a valid date range of at most 366 days.'};
}
export async function readAnalytics(supabase:Awaited<ReturnType<typeof createClient>>,from:string,to:string,page=1):Promise<AnalyticsReport>{
 const {data,error}=await supabase.rpc('analytics_report',{p_from:from,p_to:to,p_offset:(page-1)*50});
 if(error)throw error;return data as AnalyticsReport;
}
export function taskVariance(task:Pick<ReportTask,'estimated_minutes'|'actual_seconds'>){
 if(task.estimated_minutes===null||task.actual_seconds===null)return null;
 return task.actual_seconds/60-task.estimated_minutes;
}
