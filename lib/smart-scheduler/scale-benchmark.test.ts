import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { scheduleTasks } from './engine';
import { inspectActualScheduler } from './qa-bridge';
import type { SchedulerInput, SchedulerTask } from './types';

const time=(day:number,hour:number)=>new Date(Date.UTC(2026,10,2+day,hour)).toISOString();
const quantile=(array:number[],p:number)=>[...array].sort((a,b)=>a-b)[Math.ceil(array.length*p)-1];
const mb=(bytes:number)=>Math.round(bytes/1024/1024*100)/100;
const round=(n:number)=>Math.round(n*100)/100;
function dataset(size:number):SchedulerInput {
  const tasks:SchedulerTask[]=Array.from({length:size},(_,i)=>({
    id:`scale-${String(i).padStart(4,'0')}`,
    priority:i%13===0?'high':i%5===0?'low':'normal',
    estimatedMinutes:i%4===0?45:i%4===1?20:i%4===2?30:60,
    deadlineUtc:i%7===0?time(7,20):null,
    deferralCount:i%17===0?2:0,
  }));
  const availability=Array.from({length:14},(_,d)=>({
    startUtc:time(d,8),endUtc:time(d,20),
  }));
  const fixedBlocks=Array.from({length:14},(_,d)=>({
    id:`event-${d}`,kind:'event' as const,startUtc:time(d,12),endUtc:time(d,13),
  }));
  return {nowUtc:time(0,6),inputRevision:`scale-${size}-14d`,tasks,
    availability,fixedBlocks,policy:{slotMinutes:15,breakMinutes:5,defaultEstimateMinutes:30}};
}
describe('F2-A03 scale benchmark: real F2-A02 engine and independent QA oracle',()=>{
 it('measures 100/500/1000 tasks: runtime, heap/RSS samples, coverage, disruption and violations',()=>{
  for(const size of [100,500,1000]) {
    const input=dataset(size);
    const baseline=scheduleTasks(input,'baseline');
    const optimized=scheduleTasks(input,'optimized');
    expect(baseline.metrics.hardViolations).toBe(0);
    expect(optimized.metrics.hardViolations).toBe(0);
    expect(inspectActualScheduler(input,optimized)).toEqual([]);
    const accepted=optimized.placements.map(p=>({
      taskId:p.taskId,startUtc:p.startUtc,endUtc:p.endUtc,
    }));
    const replanningInput:SchedulerInput={...input,previousPlacements:accepted,
      fixedBlocks:[...input.fixedBlocks,{
        id:'new-fixed',kind:'event',startUtc:time(0,8),endUtc:time(0,9),
      }]};
    const replan=scheduleTasks(replanningInput,'optimized');
    const replanBaseline=scheduleTasks(replanningInput,'baseline');
    expect(replan.metrics.hardViolations).toBe(0);
    expect(inspectActualScheduler(replanningInput,replan)).toEqual([]);
    expect(replan.metrics.movedAcceptedTasks).toBeLessThanOrEqual(replanBaseline.metrics.movedAcceptedTasks);
    // Warm-up and five actual measurements. Memory is noisy, so record sampled
    // heap/RSS deltas and AFTER snapshots; do not mislabel them peak allocations.
    scheduleTasks(input);
    const samples:Array<{ms:number;heapAfter:number;rssAfter:number;heapDelta:number;rssDelta:number}>=[];
    for(let n=0;n<5;n++) {
      const before=process.memoryUsage();
      const t=performance.now();
      const result=scheduleTasks(input);
      const elapsed=performance.now()-t;
      const after=process.memoryUsage();
      expect(result.metrics.hardViolations).toBe(0);
      samples.push({ms:elapsed,heapAfter:after.heapUsed,rssAfter:after.rss,
        heapDelta:after.heapUsed-before.heapUsed,rssDelta:after.rss-before.rss});
    }
    const report={
      fixture:`${size} tasks / 14 days with daily events`,node:process.version,platform:process.platform,
      runs:samples.length,
      durationMs:{p50:round(quantile(samples.map(x=>x.ms),0.5)),
        p95:round(quantile(samples.map(x=>x.ms),0.95))},
      memoryObservedMB:{
        heapAfterP50:mb(quantile(samples.map(x=>x.heapAfter),0.5)),
        heapDeltaP50:mb(quantile(samples.map(x=>x.heapDelta),0.5)),
        rssAfterP50:mb(quantile(samples.map(x=>x.rssAfter),0.5)),
        rssDeltaP50:mb(quantile(samples.map(x=>x.rssDelta),0.5)),
      },
      optimized:{covered:optimized.metrics.scheduledTasks,eligible:optimized.metrics.eligibleTasks,
        ratio:round(optimized.metrics.coverageRatio),hardViolations:optimized.metrics.hardViolations},
      baseline:{covered:baseline.metrics.scheduledTasks,eligible:baseline.metrics.eligibleTasks,
        ratio:round(baseline.metrics.coverageRatio),hardViolations:baseline.metrics.hardViolations},
      afterNewEvent:{movedOptimized:replan.metrics.movedAcceptedTasks,
        movedBaseline:replanBaseline.metrics.movedAcceptedTasks,
        hardViolations:replan.metrics.hardViolations},
      oracleIssues:inspectActualScheduler(input,optimized).length,
    };
    console.log('F2_A03_SCALE_RESULT='+JSON.stringify(report));
  }
 });
});
