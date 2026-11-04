/**
 * F2-A03: pure, owner-scoped data transformation. No Supabase client or writes.
 * The caller MUST fetch an authenticated, consistent snapshot and revalidate all
 * revisions and hard constraints at commit time (the adapter is not authorization).
 */
import { createHash } from 'node:crypto';
import { getMidnightInTimeZone } from '../analytics';
import { validDate } from '../calendar';
import { addDays, timezone } from '../planning';
import { wallTimeInstants } from '../wall-time';
import { scheduleTasks } from './engine';
import type { SchedulerInput, SchedulerOutput, FixedBlock, UtcInterval, SchedulerPolicy, ReasonCode } from './types';
import type { DurationSample } from './types';

export const SMART_CALENDAR_SCHEMA_VERSION = 'smart-calendar/v0.1' as const;
const MAX_HISTORY_SAMPLES = 200;
const MINUTE = 60_000;

export type OwnedInterval = { user_id: string; start_at: string; end_at: string };
/** Projection of existing public.schedules; original updated_at stays byte-for-byte intact. */
export type FocusScheduleRow = {
  id: string; user_id: string; updated_at: string;
  priority: 'low'|'normal'|'high'; estimated_minutes: number|null;
  scheduled_date: string|null; scheduled_time: string|null;
  deadline: string|null; is_done: boolean; deleted_at: string|null;
  deferral_count: number; project_id: string|null; skill_id: string|null;
  completed_at?: string|null;
};
export type FocusCompletedSessionRow = {
  id: string; user_id: string; schedule_id: string|null;
  session_kind: 'focus'|'short_break'|'long_break';
  focus_status: 'running'|'paused'|'completed'|'abandoned';
  duration_sec: number|null; ended_at: string|null;
};
export type FocusBusyInterval = OwnedInterval & {
  source_id: string; kind: 'external'|'locked'|'active_focus';
};
/** Only scheduler-managed accepted versions belong here, never manually placed rows. */
export type FocusAcceptedBlock = OwnedInterval & {
  schedule_id: string; version_id: string; expected_updated_at: string;
  is_locked: boolean;
};
export type SmartCalendarSnapshotV01 = {
  schema_version: typeof SMART_CALENDAR_SCHEMA_VERSION;
  user_id: string; timezone: string;
  captured_at: string;
  window: { start_at: string; end_at: string };
  base_version_id: string|null;
  schedules: FocusScheduleRow[];
  availability: OwnedInterval[];
  busy_intervals: FocusBusyInterval[];
  accepted_blocks: FocusAcceptedBlock[];
  focus_sessions: FocusCompletedSessionRow[];
  preferred_windows?: OwnedInterval[];
  policy?: SchedulerPolicy;
};
export type SmartCalendarPlacementV01 = {
  schedule_id: string; expected_updated_at: string;
  start_at: string; end_at: string; locked: false;
  reason_codes: ReasonCode[];
  estimate_source: 'user'|'default'|'history_skill'|'history_project'|'history_global';
};
export type SmartCalendarOutputV01 = {
  schema_version: typeof SMART_CALENDAR_SCHEMA_VERSION;
  algorithm_version: SchedulerOutput['algorithmVersion'];
  base_version_id: string|null;
  /** sha256 fingerprint of normalized user-scoped snapshot, not an authorization token. */
  input_fingerprint: string;
  placements: SmartCalendarPlacementV01[];
  unplaced: Array<{ schedule_id: string; reason_code: ReasonCode }>;
  warnings: Array<{ code: ReasonCode }>;
  changes: Array<{ schedule_id: string; before: UtcInterval|null; after: UtcInterval|null }>;
  metrics: SchedulerOutput['metrics'];
};
export class SnapshotValidationError extends Error {
  constructor(readonly code:
    'OWNER_MISMATCH'|'INVALID_SNAPSHOT'|'UNBOUNDED_FIXED_EVENT'|'STALE_ACCEPTED_VERSION'|'INVALID_TIMEZONE',
    message: string) { super(message); this.name = 'SnapshotValidationError'; }
}
const bad=(code:SnapshotValidationError['code'],message:string):never=>{
  throw new SnapshotValidationError(code,message);
};
function timestamp(value:string):number {
  if(typeof value!=='string'|| !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value))
    return bad('INVALID_SNAPSHOT','Expected ISO timestamp with explicit offset');
  const date=Date.parse(value);
  if(!Number.isFinite(date))return bad('INVALID_SNAPSHOT','Invalid instant');
  return date;
}
function utc(value:string):string {return new Date(timestamp(value)).toISOString();}
function within(value:OwnedInterval,owner:string):UtcInterval {
  if(value.user_id!==owner)bad('OWNER_MISMATCH','Snapshot contains foreign interval');
  if(!value.end_at)bad('UNBOUNDED_FIXED_EVENT','Busy interval needs a known end');
  const start=timestamp(value.start_at),end=timestamp(value.end_at);
  if(end<=start)bad('INVALID_SNAPSHOT','Empty/reversed time interval');
  return {startUtc:new Date(start).toISOString(),endUtc:new Date(end).toISOString()};
}
function localDayStart(day:string,zone:string):number {
  if(!validDate(day)||day<'0002-01-01'||day>'9998-12-30')
    return bad('INVALID_SNAPSHOT','Unsupported local calendar day');
  const midnight=getMidnightInTimeZone(new Date(day+'T00:00:00Z'),zone).getTime();
  if(!Number.isFinite(midnight))bad('INVALID_SNAPSHOT','Could not resolve local midnight');
  return midnight;
}
export function localDeadlineExclusiveUtc(day:string,zone:string):string {
  if (timezone(zone)!==zone) bad('INVALID_TIMEZONE','Expected valid IANA timezone');
  return new Date(localDayStart(addDays(day,1),zone)).toISOString();
}
function scheduledStart(row:FocusScheduleRow,zone:string):number {
  if(!row.scheduled_date || !row.scheduled_time) throw new SnapshotValidationError('INVALID_SNAPSHOT','Missing dated start');
  const instants=wallTimeInstants(row.scheduled_date,row.scheduled_time.slice(0,5),zone);
  if(!instants.length)bad('INVALID_SNAPSHOT','Nonexistent local scheduled time');
  return instants[instants.length-1]; // Existing app policy: later (standard) fold.
}
function crop(block:UtcInterval,window:UtcInterval):UtcInterval|null {
  const start=Math.max(Date.parse(block.startUtc),Date.parse(window.startUtc));
  const end=Math.min(Date.parse(block.endUtc),Date.parse(window.endUtc));
  return end>start ? {startUtc:new Date(start).toISOString(),endUtc:new Date(end).toISOString()}:null;
}
const ordered=<T,>(rows:T[],key:(item:T)=>string)=>[...rows].sort((a,b)=>key(a).localeCompare(key(b)));
function historySamples(rows:FocusScheduleRow[],sessions:FocusCompletedSessionRow[],owner:string,asOf:number):DurationSample[] {
  const tasks=new Map(rows.map(row=>[row.id,row]));
  const ids=new Set<string>();
  const totals=new Map<string,{seconds:number;lastEnd:number}>();
  for(const session of sessions) {
    if(session.user_id!==owner)bad('OWNER_MISMATCH','Foreign focus session in snapshot');
    if(!session.id||ids.has(session.id))bad('INVALID_SNAPSHOT','Duplicate focus session');
    ids.add(session.id);
    if(!session.schedule_id||session.session_kind!=='focus'||session.focus_status!=='completed'
       ||!session.ended_at||!Number.isInteger(session.duration_sec)||session.duration_sec! <= 0
       ||session.duration_sec! > 86400)continue;
    const task=tasks.get(session.schedule_id);
    if(!task || !task.is_done || task.deleted_at)continue;
    let ended:number;
    try { ended=timestamp(session.ended_at); } catch { continue; }
    if(ended>asOf)continue; // No future observations or look-ahead leakage.
    const value=totals.get(task.id)??{seconds:0,lastEnd:0};
    value.seconds+=session.duration_sec!;
    value.lastEnd=Math.max(value.lastEnd,ended);
    totals.set(task.id,value);
  }
  return [...totals.entries()]
    .filter(([,v])=>v.seconds>=60&&v.seconds<=86400)
    .sort(([a,x],[b,y])=>y.lastEnd-x.lastEnd||a.localeCompare(b))
    .slice(0,MAX_HISTORY_SAMPLES)
    .map(([id,v])=>({
      minutes:Math.round(v.seconds/60),projectId:tasks.get(id)!.project_id,skillId:tasks.get(id)!.skill_id,
    }));
}

export type AdaptedSmartCalendar = {
  engineInput: SchedulerInput;
  /** Precisely one owner and one revision per scheduler-manageable task. */
  taskRevisions: ReadonlyMap<string,string>;
  historicalSampleCount: number;
  inputFingerprint: string;
};
export function adaptFocusSnapshot(snapshot:SmartCalendarSnapshotV01):AdaptedSmartCalendar {
  if(snapshot.schema_version!==SMART_CALENDAR_SCHEMA_VERSION || !snapshot.user_id ||
    snapshot.base_version_id===undefined || !Array.isArray(snapshot.schedules) ||
    !Array.isArray(snapshot.availability)||!Array.isArray(snapshot.busy_intervals)||
    !Array.isArray(snapshot.accepted_blocks)||!Array.isArray(snapshot.focus_sessions))
    bad('INVALID_SNAPSHOT','Incomplete canonical snapshot');
  if(timezone(snapshot.timezone)!==snapshot.timezone)
    bad('INVALID_TIMEZONE','Account timezone must be a valid IANA identifier');
  const owner=snapshot.user_id,zone=snapshot.timezone;
  const window=within({...snapshot.window,user_id:owner},owner);
  const now=utc(snapshot.captured_at);
  const taskRows=ordered(snapshot.schedules,x=>x.id);
  const taskMap=new Map<string,FocusScheduleRow>();
  for(const row of taskRows) {
    if(row.user_id!==owner)bad('OWNER_MISMATCH','Foreign schedule in snapshot');
    if(!row.id||taskMap.has(row.id)||!row.updated_at)
      bad('INVALID_SNAPSHOT','Duplicate schedule or missing revision');
    timestamp(row.updated_at);
    taskMap.set(row.id,row);
  }
  const sampleList=historySamples(taskRows,snapshot.focus_sessions,owner,timestamp(now));
  const fixedBlocks:FixedBlock[]=[];
  for(const busy of ordered(snapshot.busy_intervals,x=>x.source_id)) {
    const block=within(busy,owner);
    fixedBlocks.push({...block,id:busy.source_id,kind:busy.kind==='external'?'event':busy.kind});
  }
  const accepted=new Map<string,FocusAcceptedBlock>();
  for(const item of ordered(snapshot.accepted_blocks,x=>x.schedule_id)) {
    const interval=within(item,owner);
    if(!snapshot.base_version_id||item.version_id!==snapshot.base_version_id)
      bad('STALE_ACCEPTED_VERSION','Accepted placement does not match base version');
    const task=taskMap.get(item.schedule_id);
    if(!task || task.is_done || task.deleted_at || accepted.has(item.schedule_id))
      throw new SnapshotValidationError('INVALID_SNAPSHOT','Accepted placement must belong to one active task');
    if(item.expected_updated_at!==task.updated_at)
      bad('STALE_ACCEPTED_VERSION','Accepted placement has stale task revision');
    accepted.set(item.schedule_id,item);
    if(item.is_locked)
      fixedBlocks.push({...interval,id:'accepted-lock:'+item.schedule_id,kind:'locked'});
  }
  const previousPlacements:SchedulerInput['previousPlacements']=[];
  const tasks:SchedulerInput['tasks']=[];
  const versions=new Map<string,string>();
  for(const row of taskRows) {
    if(row.deleted_at||row.is_done)continue;
    if(row.scheduled_time && !row.scheduled_date)
      bad('INVALID_SNAPSHOT','Timed task has no date');
    if(row.scheduled_date && row.scheduled_time) {
      if(!accepted.has(row.id) && (!Number.isInteger(row.estimated_minutes)||row.estimated_minutes!<1||
         row.estimated_minutes!>1440))
        bad('UNBOUNDED_FIXED_EVENT','Timed task needs explicit duration to prove no overlap');
      const start=scheduledStart(row,zone);
      const interval={startUtc:new Date(start).toISOString(),
        endUtc:new Date(start+row.estimated_minutes!*MINUTE).toISOString()};
      if(!accepted.has(row.id)) {
        fixedBlocks.push({...interval,id:'manual:'+row.id,kind:'locked'});
        continue; // Manual blocks are not re-optimized.
      }
    }
    const prior=accepted.get(row.id);
    if(prior?.is_locked)continue;
    if(prior) {
      const interval=within(prior,owner);
      previousPlacements.push({taskId:row.id,...interval});
    }
    const dateStart=row.scheduled_date?localDayStart(row.scheduled_date,zone):null;
    const dateEnd=row.scheduled_date&&!row.scheduled_time
      ?localDayStart(addDays(row.scheduled_date,1),zone):null;
    const due=row.deadline?localDayStart(addDays(row.deadline,1),zone):null;
    const limit=[dateEnd,due].filter((x):x is number=>x!==null);
    tasks.push({
      id:row.id,priority:row.priority,estimatedMinutes:row.estimated_minutes,
      deadlineUtc:limit.length?new Date(Math.min(...limit)).toISOString():null,
      earliestStartUtc:dateStart===null?null:new Date(dateStart).toISOString(),
      deferralCount:row.deferral_count,projectId:row.project_id,skillId:row.skill_id,
      ...(row.estimated_minutes===null?{durationSamples:sampleList}:{}),
    });
    versions.set(row.id,row.updated_at);
  }
  const availability=ordered(snapshot.availability,x=>x.start_at+x.end_at)
    .map(x=>crop(within(x,owner),window)).filter((x):x is UtcInterval=>x!==null);
  const preferredWindows=ordered(snapshot.preferred_windows??[],x=>x.start_at+x.end_at)
    .map(x=>crop(within(x,owner),window)).filter((x):x is UtcInterval=>x!==null);
  // Revision input includes ALL relevant source rows, not just rows being updated;
  // removed/unselected fixed blocks must invalidate a previously computed proposal.
  const fingerprintData={
    schema_version:SMART_CALENDAR_SCHEMA_VERSION,user_id:owner,timezone:zone,
    window,now,base_version_id:snapshot.base_version_id,
    schedules:taskRows.map(({id,updated_at,priority,estimated_minutes,scheduled_date,scheduled_time,
      deadline,is_done,deleted_at,deferral_count,project_id,skill_id})=>({
      id,updated_at,priority,estimated_minutes,scheduled_date,scheduled_time,deadline,
      is_done,deleted_at,deferral_count,project_id,skill_id})),
    fixedBlocks:ordered(fixedBlocks,x=>x.id),
    availability,preferredWindows,
    previousPlacements:ordered(previousPlacements,x=>x.taskId),
    samples:sampleList,policy:snapshot.policy??null,
  };
  const inputFingerprint='sha256:'+createHash('sha256').update(JSON.stringify(fingerprintData)).digest('hex');
  return {
    engineInput:{
      nowUtc:now,inputRevision:inputFingerprint,tasks,availability,
      fixedBlocks,previousPlacements,preferredWindows,policy:snapshot.policy,
    },
    taskRevisions:versions,historicalSampleCount:sampleList.length,inputFingerprint,
  };
}
/** End-to-end preview: canonical trusted snapshot -> actual F2-A02 engine -> backend v0.1 wire format. */
export function previewSmartCalendar(snapshot:SmartCalendarSnapshotV01): {
  output: SmartCalendarOutputV01; adapted: AdaptedSmartCalendar; raw: SchedulerOutput;
} {
  const adapted=adaptFocusSnapshot(snapshot);
  const raw=scheduleTasks(adapted.engineInput);
  const output:SmartCalendarOutputV01={
    schema_version:SMART_CALENDAR_SCHEMA_VERSION,algorithm_version:raw.algorithmVersion,
    base_version_id:snapshot.base_version_id,input_fingerprint:adapted.inputFingerprint,
    placements:raw.placements.map(p=>({
      schedule_id:p.taskId,expected_updated_at:adapted.taskRevisions.get(p.taskId)!,
      start_at:p.startUtc,end_at:p.endUtc,locked:false,
      reason_codes:p.reasonCodes,estimate_source:p.estimateSource,
    })),
    unplaced:raw.unplaced.map(p=>({schedule_id:p.taskId,reason_code:p.reasonCode})),
    warnings:raw.warnings.map(code=>({code})),
    changes:raw.changes.map(c=>({schedule_id:c.taskId,before:c.before,after:c.after})),
    metrics:raw.metrics,
  };
  return {output,adapted,raw};
}
