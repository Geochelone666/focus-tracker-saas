/**
 * F2-A03: compatibility bridge to PR #72's untouched independent QA oracle.
 * This file calls the REAL F2-A02 engine and translates actual results;
 * it does not mock or duplicate the implementation of the QA checker.
 */
import { estimateDuration } from './personalization';
import { scheduleTasks } from './engine';
import type { SchedulerInput, SchedulerOutput, UtcInterval } from './types';
import {
  inspectSchedulerProposal, compareDeterministicOutputs, inspectFrozenStability,
  type QAInput, type QAProposal,
} from '../../qa/scheduler-acceptance';

const ms=(utc:string)=>Date.parse(utc);
const normalize=(a:UtcInterval)=>({startMs:ms(a.startUtc),endMs:ms(a.endUtc)});
function unionIntervals(windows:QAInput['windows']):QAInput['windows'] {
  const merged:QAInput['windows']=[];
  for(const window of [...windows].sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs)) {
    const last=merged[merged.length-1];
    if(last && window.startMs<=last.endMs)last.endMs=Math.max(last.endMs,window.endMs);
    else merged.push({...window});
  }
  return merged;
}
/** Consumes the engine's input AND actual output, never an independently invented fixture proposal. */
export function actualEngineQaProjection(input:SchedulerInput,output:SchedulerOutput):{
  qaInput:QAInput;qaOutput:QAProposal;
} {
  const defaultMinutes=input.policy?.defaultEstimateMinutes??30;
  const qaInput:QAInput={
    tasks:input.tasks.filter(t=>!t.completed&&!t.deleted).map(task=>{
      let durationMinutes=0; // rejected invalid task estimates must still appear unassigned.
      try {durationMinutes=estimateDuration(task,defaultMinutes).minutes;}catch{/* engine emits INVALID_ESTIMATE */}
      return {id:task.id,durationMinutes,
        ...(task.deadlineUtc?{deadlineMs:ms(task.deadlineUtc)}:{}),
        ...(task.earliestStartUtc?{earliestStartMs:Math.max(ms(input.nowUtc),ms(task.earliestStartUtc))}:{earliestStartMs:ms(input.nowUtc)}),
      };
    }),
    windows:unionIntervals(input.availability.map(normalize)),
    locked:input.fixedBlocks.map(normalize),
  };
  const qaOutput:QAProposal={
    assignments:output.placements.map(p=>({
      taskId:p.taskId,startMs:ms(p.startUtc),endMs:ms(p.endUtc),reasonCodes:p.reasonCodes,
    })),
    unassigned:output.unplaced.map(p=>({taskId:p.taskId,reasonCode:p.reasonCode})),
  };
  return {qaInput,qaOutput};
}
export function inspectActualScheduler(input:SchedulerInput,output:SchedulerOutput):string[] {
  const {qaInput,qaOutput}=actualEngineQaProjection(input,output);
  return inspectSchedulerProposal(qaInput,qaOutput);
}
/** Calls both the engine and QA oracle twice, then checks actual deterministic output and frozen plans. */
export function verifyActualScheduler(input:SchedulerInput,frozenTaskIds:string[]=[]):{
  result:SchedulerOutput; issues:string[]; deterministic:boolean; frozenIssues:string[];
} {
  const result=scheduleTasks(input),again=scheduleTasks(input);
  const proposal=actualEngineQaProjection(input,result).qaOutput;
  const repeat=actualEngineQaProjection(input,again).qaOutput;
  const previous:QAProposal={
    assignments:(input.previousPlacements??[]).map(p=>({
      taskId:p.taskId,startMs:ms(p.startUtc),endMs:ms(p.endUtc),reasonCodes:['PRESERVED_ACCEPTED'],
    })),unassigned:[],
  };
  return {
    result,issues:inspectActualScheduler(input,result),
    deterministic:compareDeterministicOutputs(proposal,repeat),
    frozenIssues:inspectFrozenStability(previous,proposal,frozenTaskIds),
  };
}
