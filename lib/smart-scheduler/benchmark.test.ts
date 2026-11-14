import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import { scheduleTasks } from './engine';
import type { SchedulerInput, SchedulerTask } from './types';
const stamp=(day:number,hour:number)=>new Date(Date.UTC(2026,10,day,hour)).toISOString();
const percentile=(samples:number[],ratio:number)=>[...samples].sort((a,b)=>a-b)[Math.ceil(samples.length*ratio)-1];
function dataset():SchedulerInput {
 const tasks:SchedulerTask[]=Array.from({length:200},(_,i)=>({
  id:`task-${String(i).padStart(3,'0')}`,priority:i%7===0?'high':i%3===0?'low':'normal',
  estimatedMinutes:30,deferralCount:i%11===0?1:0,
 }));
 return {nowUtc:stamp(2,7),inputRevision:'benchmark-200-14d',tasks,
  availability:Array.from({length:14},(_,d)=>({startUtc:stamp(2+d,9),endUtc:stamp(2+d,21)})),
  fixedBlocks:[],policy:{slotMinutes:15,breakMinutes:5}};
}
describe('F2-A02 deterministic performance and baseline comparison',()=>{
 it('records measured timing, coverage, hard violations, and incremental disruption',()=>{
  const data=dataset();
  const simple=scheduleTasks(data,'baseline'),optimal=scheduleTasks(data);
  expect(simple.metrics.hardViolations).toBe(0);
  expect(optimal.metrics.hardViolations).toBe(0);
  expect(optimal.metrics.coverageRatio).toBeGreaterThanOrEqual(0);
  expect(optimal.metrics.coverageRatio).toBeLessThanOrEqual(1);
  const previous=optimal.placements.map(p=>({taskId:p.taskId,startUtc:p.startUtc,endUtc:p.endUtc}));
  const changed:SchedulerInput={...data,previousPlacements:previous,
    fixedBlocks:[{id:'new-meeting',kind:'event',startUtc:stamp(2,9),endUtc:stamp(2,10)}]};
  const changedOptimized=scheduleTasks(changed);
  const changedBaseline=scheduleTasks(changed,'baseline');
  expect(changedOptimized.metrics.hardViolations).toBe(0);
  expect(changedOptimized.metrics.movedAcceptedTasks).toBeLessThan(changedBaseline.metrics.movedAcceptedTasks);
  const times:number[]=[];
  for(let i=0;i<7;i++){const started=performance.now();scheduleTasks(data);times.push(performance.now()-started);}
  const report={fixture:'200 tasks / 14 days',runs:times.length,
    durationMs:{median:Number(percentile(times,0.5).toFixed(2)),p95:Number(percentile(times,0.95).toFixed(2))},
    optimized:{coverage:optimal.metrics.coverageRatio,violations:optimal.metrics.hardViolations},
    baseline:{coverage:simple.metrics.coverageRatio,violations:simple.metrics.hardViolations},
    replan:{optimizedMoves:changedOptimized.metrics.movedAcceptedTasks,
      baselineMoves:changedBaseline.metrics.movedAcceptedTasks}};
  console.log('SMART_SCHEDULER_BENCHMARK='+JSON.stringify(report));
 });
});
