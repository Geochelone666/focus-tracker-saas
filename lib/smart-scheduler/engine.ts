import { estimateDuration } from './personalization';
import type {
  AcceptedPlacement, Placement, ReasonCode, SchedulerInput, SchedulerOutput, SchedulerTask, UtcInterval,
} from './types';

const VERSION = 'smart-scheduler-v1' as const;
const MINUTE = 60_000;
type Interval = { start: number; end: number };
type PreparedTask = { task: SchedulerTask; minutes: number; source: Placement['estimateSource'];
  deadline: number; earliest: number; score: number };
type Occupied = Interval & { taskId?: string };

function instant(value: string): number {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) throw new Error('Expected ISO UTC instant');
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0,19) !== value.slice(0,19))
    throw new Error('Invalid UTC instant');
  return parsed;
}
const iso = (value: number) => new Date(value).toISOString();
const toInterval = (block: UtcInterval): Interval => {
  const start = instant(block.startUtc), end = instant(block.endUtc);
  if (end <= start) throw new Error('Invalid interval');
  return { start, end };
};
function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a,b) => a.start-b.start || a.end-b.end);
  const result: Interval[] = [];
  for (const item of sorted) {
    const last = result[result.length-1];
    if (last && item.start <= last.end) last.end = Math.max(last.end, item.end);
    else result.push({ ...item });
  }
  return result;
}
function lowerBound(busy: Occupied[], start: number): number {
  let lo = 0, hi = busy.length;
  while (lo < hi) {
    const mid = (lo+hi) >>> 1;
    if (busy[mid].start < start) lo = mid+1;
    else hi = mid;
  }
  return lo;
}
function conflicting(busy: Occupied[], start: number, end: number): Occupied | null {
  const index = lowerBound(busy, start);
  if (index > 0 && busy[index-1].end > start) return busy[index-1];
  if (index < busy.length && busy[index].start < end) return busy[index];
  return null;
}
function insertBusy(busy: Occupied[], interval: Occupied): void {
  busy.splice(lowerBound(busy, interval.start), 0, interval);
}
const fitsAvailability = (windows: Interval[], start: number, end: number) =>
  windows.some(window => window.start <= start && end <= window.end);
const rank = { high: 30, normal: 15, low: 5 } as const;
function priorityScore(task: SchedulerTask, deadline: number, now: number): number {
  const days = (deadline-now) / (24*60*MINUTE);
  const urgency = days <= 1 ? 35 : days <= 2 ? 25 : days <= 4 ? 15 : days <= 8 ? 5 : 0;
  return rank[task.priority] + (Number.isFinite(deadline) ? urgency : 0) +
    Math.min(2, Math.max(0, task.deferralCount ?? 0))*5;
}
function prepare(task: SchedulerTask, now: number, defaultMinutes: number): PreparedTask | ReasonCode {
  if (!task.id || !Object.hasOwn(rank, task.priority) ||
      !Number.isInteger(task.deferralCount ?? 0) || (task.deferralCount ?? 0) < 0) return 'INVALID_TASK';
  let deadline = Infinity, earliest = now;
  try {
    if (task.deadlineUtc) deadline = instant(task.deadlineUtc);
    if (task.earliestStartUtc) earliest = Math.max(earliest, instant(task.earliestStartUtc));
  } catch { return 'INVALID_INTERVAL'; }
  if (deadline <= now) return 'DEADLINE_IN_PAST';
  if (deadline <= earliest) return 'EARLIEST_START_UNREACHABLE';
  try {
    const estimate = estimateDuration(task,defaultMinutes);
    return { task, minutes: estimate.minutes, source: estimate.source, deadline, earliest,
      score: priorityScore(task,deadline,now) };
  } catch { return 'INVALID_ESTIMATE'; }
}
function placement(task: PreparedTask, start: number, codes: ReasonCode[]): Placement {
  return { taskId: task.task.id, startUtc: iso(start), endUtc: iso(start+task.minutes*MINUTE),
    estimatedMinutes: task.minutes, estimateSource: task.source,
    reasonCodes: [...new Set(codes)] };
}
function candidateFor(
  task: PreparedTask, availability: Interval[], busy: Occupied[], preferred: Interval[],
  slotMs: number, bufferMs: number, horizonEnd: number, baseline: boolean,
): number | null {
  let best: number | null = null, bestCost = Infinity;
  for (const window of availability) {
    const first = Math.ceil(Math.max(window.start,task.earliest)/slotMs)*slotMs;
    const latest = Math.min(window.end,horizonEnd)-task.minutes*MINUTE-bufferMs;
    const lastByDeadline = task.deadline-task.minutes*MINUTE;
    for (let start = first; start <= Math.min(latest,lastByDeadline); start += slotMs) {
      const end = start+task.minutes*MINUTE+bufferMs;
      const overlap = conflicting(busy,start,end);
      if (overlap) {
        // Skip slots ending before a known blocker; no need to scan each interior slot.
        start = Math.max(start, Math.ceil(overlap.end/slotMs)*slotMs-slotMs);
        continue;
      }
      if (baseline) return start; // B0 = priority then earliest fit.
      const inPreferred = preferred.some(window => window.start<=start &&
        start+task.minutes*MINUTE<=window.end);
      const cost = (start-task.earliest)/(60*MINUTE)*0.5 - (inPreferred ? 5 : 0);
      if (cost < bestCost || (cost === bestCost && (best===null || start<best))) {
        best = start; bestCost = cost;
      }
      // A preferred placement has at most 10h of benefit; later days cannot improve it.
      if (best !== null && start-best > 12*60*MINUTE) break;
    }
  }
  return best;
}
function unchangedAccepted(
  previous: AcceptedPlacement | undefined, task: PreparedTask, availability: Interval[],
  busy: Occupied[], bufferMs: number, horizonEnd: number,
): boolean {
  if (!previous) return false;
  let prev: Interval;
  try { prev = toInterval(previous); } catch { return false; }
  return prev.start >= task.earliest && prev.end <= task.deadline &&
    prev.end <= horizonEnd && prev.end-prev.start === task.minutes*MINUTE &&
    fitsAvailability(availability,prev.start,prev.end+bufferMs) &&
    !conflicting(busy,prev.start,prev.end+bufferMs);
}

/** Independent deterministic solver. Caller must resolve wall times and authenticate data. */
export function scheduleTasks(input: SchedulerInput, mode: 'optimized' | 'baseline' = 'optimized'): SchedulerOutput {
  if (!input.inputRevision || !Array.isArray(input.tasks)) throw new Error('Invalid input revision/tasks');
  const now = instant(input.nowUtc);
  const slot = input.policy?.slotMinutes ?? 15;
  const buffer = input.policy?.breakMinutes ?? 5;
  const defaultMinutes = input.policy?.defaultEstimateMinutes ?? 30;
  if (!Number.isInteger(slot) || slot < 1 || slot > 60 || 60%slot !== 0 ||
      !Number.isInteger(buffer) || buffer < 0 || buffer > 120 ||
      !Number.isInteger(defaultMinutes) || defaultMinutes < 1 || defaultMinutes > 1440)
    throw new Error('Invalid scheduler policy');
  const slotMs=slot*MINUTE, bufferMs=buffer*MINUTE;
  const windows=mergeIntervals(input.availability.map(toInterval)
    .map(w => ({start:Math.max(w.start,now),end:w.end})).filter(w => w.end>w.start));
  const horizonEnd = windows.reduce((max,w)=>Math.max(max,w.end),now);
  const fixed=input.fixedBlocks.map(toInterval).sort((a,b)=>a.start-b.start || a.end-b.end);
  // Merge overlapping immutable events before binary-search collision checks.
  const busy: Occupied[]=mergeIntervals(fixed).map(x=>({ ...x }));
  const warnings: ReasonCode[]=[];
  if (fixed.some((entry,i)=>i>0 && fixed[i-1].end>entry.start)) warnings.push('FIXED_BLOCKS_OVERLAP');
  const preferred=(input.preferredWindows ?? []).map(toInterval);
  const seen=new Set<string>();
  const unplaced: SchedulerOutput['unplaced']=[];
  const eligible: PreparedTask[]=[];
  for (const task of input.tasks) {
    if (!task.id || seen.has(task.id)) throw new Error('Duplicate/missing task id');
    seen.add(task.id);
    if (task.completed || task.deleted) continue;
    const prepared=prepare(task,now,defaultMinutes);
    if (typeof prepared === 'string') unplaced.push({taskId:task.id,reasonCode:prepared});
    else eligible.push(prepared);
  }
  const prevMap=new Map<string,AcceptedPlacement>();
  for (const previous of input.previousPlacements ?? []) {
    if (prevMap.has(previous.taskId)) throw new Error('Duplicate previous placement');
    prevMap.set(previous.taskId,previous);
  }
  const preserved=new Map<string,Placement>();
  const displaced=new Map<string,ReasonCode>();
  if (mode === 'optimized') {
    // Reserve accepted placements first. Stable ordering avoids unrelated changes.
    for (const prepared of [...eligible].sort((a,b)=>a.task.id.localeCompare(b.task.id))) {
      const previous=prevMap.get(prepared.task.id);
      if (!previous) continue;
      if (!unchangedAccepted(previous,prepared,windows,busy,bufferMs,horizonEnd)) {
        let reason: ReasonCode = 'MOVED_INVALID_ACCEPTED';
        try {
          const old = toInterval(previous);
          if (fixed.some(block => old.start < block.end && block.start < old.end+bufferMs))
            reason = 'MOVED_FIXED_CONFLICT';
        } catch { /* malformed accepted snapshot is not a fixed-event conflict */ }
        displaced.set(prepared.task.id,reason);
        continue;
      }
      const start=instant(previous.startUtc);
      const place=placement(prepared,start,['PRESERVED_ACCEPTED']);
      preserved.set(prepared.task.id,place);
      insertBusy(busy,{start,end:start+prepared.minutes*MINUTE+bufferMs,taskId:prepared.task.id});
    }
  }
  const pending=eligible.filter(task=>!preserved.has(task.task.id)).sort((a,b)=>
    (mode==='baseline' ? rank[b.task.priority]-rank[a.task.priority] :
      b.score-a.score || a.deadline-b.deadline) || a.task.id.localeCompare(b.task.id));
  const placements: Placement[]=[...preserved.values()];
  for (const prepared of pending) {
    const start=candidateFor(prepared,windows,busy,preferred,slotMs,bufferMs,horizonEnd,mode==='baseline');
    if (start === null) {
      const reachable=windows.some(w=>w.end>prepared.earliest);
      const deadlineBlocks=Number.isFinite(prepared.deadline) &&
        windows.some(w=>w.start >= prepared.deadline || w.end > prepared.deadline);
      unplaced.push({taskId:prepared.task.id,
        reasonCode:!windows.length?'NO_AVAILABILITY':
          !reachable?'EARLIEST_START_UNREACHABLE':
          deadlineBlocks?'HARD_DEADLINE_UNREACHABLE':'NO_CONTIGUOUS_SLOT'});
      continue;
    }
    const codes: ReasonCode[]=[];
    const displacedReason=displaced.get(prepared.task.id);
    if (displacedReason) codes.push(displacedReason);
    if (prepared.task.priority==='high') codes.push('HIGH_PRIORITY');
    if (Number.isFinite(prepared.deadline) && prepared.deadline-now <= 2*24*60*MINUTE) codes.push('DEADLINE_SOON');
    if ((prepared.task.deferralCount ?? 0)>0) codes.push('DEFERRED_BEFORE');
    if (prepared.source==='default') codes.push('DEFAULT_ESTIMATE');
    if (prepared.source.startsWith('history')) codes.push('PERSONALIZED_ESTIMATE');
    if (preferred.some(w=>w.start<=start && start+prepared.minutes*MINUTE<=w.end)) codes.push('PREFERRED_WINDOW');
    else codes.push('EARLIEST_FEASIBLE');
    placements.push(placement(prepared,start,codes));
    insertBusy(busy,{start,end:start+prepared.minutes*MINUTE+bufferMs,taskId:prepared.task.id});
  }
  placements.sort((a,b)=>instant(a.startUtc)-instant(b.startUtc)||a.taskId.localeCompare(b.taskId));
  unplaced.sort((a,b)=>a.taskId.localeCompare(b.taskId));
  const placedMap=new Map(placements.map(p=>[p.taskId,p]));
  const changes: SchedulerOutput['changes']=[];
  let moved=0,shift=0;
  for (const task of eligible) {
    const original=prevMap.get(task.task.id);
    const next=placedMap.get(task.task.id);
    const before=original?{startUtc:original.startUtc,endUtc:original.endUtc}:null;
    const after=next?{startUtc:next.startUtc,endUtc:next.endUtc}:null;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push({taskId:task.task.id,before,after});
      if (original) {
        moved++;
        if (next) shift+=Math.abs(instant(next.startUtc)-instant(original.startUtc))/MINUTE;
      }
    }
  }
  changes.sort((a,b)=>a.taskId.localeCompare(b.taskId));
  const scheduledMinutes=placements.reduce((sum,p)=>sum+p.estimatedMinutes,0);
  const remaining=eligible.reduce((sum,t)=>sum+t.minutes,0)-scheduledMinutes;
  const output: SchedulerOutput={
    algorithmVersion:VERSION,inputRevision:input.inputRevision,placements,unplaced,changes,warnings,
    metrics:{scheduledTasks:placements.length,eligibleTasks:eligible.length,
      scheduledMinutes,unplacedMinutes:remaining,coverageRatio:eligible.length?placements.length/eligible.length:1,
      hardViolations:0,movedAcceptedTasks:moved,totalShiftMinutes:shift},
  };
  output.metrics.hardViolations=auditSchedule(input,output);
  return output;
}

/** Independently recompute hard constraint violations; don't merely report zero. */
export function auditSchedule(input: SchedulerInput, output: SchedulerOutput): number {
  const now=instant(input.nowUtc), buffer=(input.policy?.breakMinutes ?? 5)*MINUTE;
  const windows=mergeIntervals(input.availability.map(toInterval));
  const fixed=input.fixedBlocks.map(toInterval);
  const tasks=new Map(input.tasks.filter(t=>!t.completed && !t.deleted).map(t=>[t.id,t]));
  const placed: Interval[]=[];
  let violations=0;
  const ids=new Set<string>();
  for (const placement of output.placements) {
    let block: Interval;
    try { block=toInterval(placement); } catch {violations++;continue;}
    const task=tasks.get(placement.taskId);
    if (!task || ids.has(placement.taskId)) violations++;
    ids.add(placement.taskId);
    if (!fitsAvailability(windows,block.start,block.end+buffer)||block.start<now) violations++;
    if (fixed.some(b=>block.start<b.end && b.start<block.end+buffer)) violations++;
    if (task?.deadlineUtc && block.end>instant(task.deadlineUtc)) violations++;
    if (task?.earliestStartUtc && block.start<instant(task.earliestStartUtc)) violations++;
    if (block.end-block.start!==placement.estimatedMinutes*MINUTE) violations++;
    if (placed.some(b=>block.start<b.end+buffer && b.start<block.end+buffer)) violations++;
    placed.push(block);
  }
  return violations;
}
