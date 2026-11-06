import {wallTimeInstants} from './wall-time';
export type RecoveryTask={id:string;title:string;updated_at:string;scheduled_date:string|null;scheduled_time:string|null;estimated_minutes:number|null;remaining_minutes:number|null;resume_note:string|null;notes:string|null;skill_id:string|null;actual_seconds:number|null;latest_session:{status:string;note:string|null;started_at:string;ended_at:string|null}|null;active_status:string|null};
export function recoveryStatus(task:RecoveryTask,zone:string,now:number){
 if(task.active_status)return {kind:'active',label:task.active_status==='paused'?'Focus is paused':'A session is still active'};
 if(task.estimated_minutes!==null&&task.actual_seconds!==null&&task.actual_seconds>task.estimated_minutes*60)
  return {kind:'over_estimate',label:'Recorded focus exceeds the original estimate'};
 if(task.latest_session?.status==='abandoned')return {kind:'interrupted',label:'Last focus session was abandoned'};
 if(task.scheduled_date&&task.scheduled_time&&task.estimated_minutes){
  const start=wallTimeInstants(task.scheduled_date,task.scheduled_time.slice(0,5),zone).at(-1);
  if(start!==undefined&&start+task.estimated_minutes*60000<=now)return {kind:'unfinished_block',label:'Planned time has passed; task is still open'};
 }
 return {kind:'open',label:'Open task'};
}
