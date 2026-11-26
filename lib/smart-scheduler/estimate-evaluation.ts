import { estimateDuration } from './personalization';
import type { DurationSample } from './types';

export type CompletedTaskObservation = {
  userId: string; taskId: string; completedAtUtc: string;
  actualMinutes: number; estimatedMinutes: number|null;
  projectId?: string|null; skillId?: string|null;
};
export type DurationEvaluation = {
  evaluated: number;
  filtered: number;
  coldStartPredictions: number;
  historySupportedPredictions: number;
  medianAbsoluteErrorMinutes: number|null;
  meanAbsoluteErrorMinutes: number|null;
  baselineMAEMinutes: number|null;
  meanSignedErrorMinutes: number|null;
};
const validMinutes=(x:number)=>Number.isFinite(x)&&x>=1&&x<=1440;
const median=(nums:number[])=>{
  const sorted=[...nums].sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
};
const rounded=(value:number)=>Math.round(value*100)/100;

/**
 * Leakage-free, strictly past-only offline evaluation. Each group sharing a
 * completion timestamp is predicted BEFORE its rows enter historical samples.
 * No production reads; backend supplies completed, owner-checked observations.
 * Baseline: explicit user estimate if present, otherwise 30m prior.
 */
export function evaluateDurationEstimates(
  ownerId:string,observations:CompletedTaskObservation[],defaultMinutes=30,
):DurationEvaluation {
  if(!ownerId||!validMinutes(defaultMinutes))
    throw new Error('Invalid estimation evaluation configuration');
  if(observations.some(x=>x.userId!==ownerId))
    throw new Error('Mixed-user duration history is forbidden');
  const seen=new Set<string>(),valid: Array<CompletedTaskObservation & {completedAtMs:number}> =[];
  let filtered=0;
  for(const row of observations) {
    const time=Date.parse(row.completedAtUtc);
    if(!row.taskId||seen.has(row.taskId))throw new Error('Duplicate completed task');
    seen.add(row.taskId);
    if(!validMinutes(row.actualMinutes)||!Number.isFinite(time)||
       !/^\d{4}-\d\d-\d\dT/.test(row.completedAtUtc)||
       (row.estimatedMinutes!==null && !validMinutes(row.estimatedMinutes))) {
      filtered++;continue;
    }
    valid.push({...row,completedAtMs:time});
  }
  valid.sort((a,b)=>a.completedAtMs-b.completedAtMs||a.taskId.localeCompare(b.taskId));
  const past:DurationSample[]=[];
  const absErrors:number[]=[];
  let baselineAbs=0,signed=0,cold=0,supported=0;
  for(let index=0;index<valid.length;) {
    const next=valid.findIndex((x,j)=>j>index&&x.completedAtMs!==valid[index].completedAtMs);
    const stop=next===-1?valid.length:next;
    for(const row of valid.slice(index,stop)) {
      const estimate=estimateDuration({
        estimatedMinutes:row.estimatedMinutes,
        projectId:row.projectId,skillId:row.skillId,durationSamples:past.slice(-200),
      },defaultMinutes);
      const error=estimate.minutes-row.actualMinutes;
      absErrors.push(Math.abs(error)); signed+=error;
      baselineAbs+=Math.abs((row.estimatedMinutes??defaultMinutes)-row.actualMinutes);
      if(estimate.source==='default')cold++;
      if(estimate.source.startsWith('history'))supported++;
    }
    for(const row of valid.slice(index,stop))past.push({
      minutes:row.actualMinutes,projectId:row.projectId,skillId:row.skillId,
    });
    index=stop;
  }
  const n=absErrors.length;
  return {
    evaluated:n,filtered,coldStartPredictions:cold,historySupportedPredictions:supported,
    medianAbsoluteErrorMinutes:n?rounded(median(absErrors)):null,
    meanAbsoluteErrorMinutes:n?rounded(absErrors.reduce((a,b)=>a+b,0)/n):null,
    baselineMAEMinutes:n?rounded(baselineAbs/n):null,
    meanSignedErrorMinutes:n?rounded(signed/n):null,
  };
}
