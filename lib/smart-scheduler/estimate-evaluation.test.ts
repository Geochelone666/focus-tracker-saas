import { describe, expect, it } from 'vitest';
import { evaluateDurationEstimates, type CompletedTaskObservation } from './estimate-evaluation';

const owner='user-A';
const record=(i:number,changes:Partial<CompletedTaskObservation>={}):CompletedTaskObservation=>({
 userId:owner,taskId:'t-'+i,
 completedAtUtc:new Date(Date.UTC(2026,10,1+i,12)).toISOString(),
 actualMinutes:60,estimatedMinutes:null,skillId:'math',projectId:'p',...changes,
});
describe('F2-A03: owner-scoped, leakage-free offline duration evaluation',()=>{
 it('01 reports explicit sample counts and cold-start predictions',()=>{
  const r=evaluateDurationEstimates(owner,[record(0)]);
  expect(r).toMatchObject({evaluated:1,filtered:0,coldStartPredictions:1,
    historySupportedPredictions:0,meanAbsoluteErrorMinutes:30,baselineMAEMinutes:30});
 });
 it('02 uses historical completed tasks only AFTER they finish',()=>{
  const r=evaluateDurationEstimates(owner,Array.from({length:15},(_,i)=>record(i)));
  expect(r.evaluated).toBe(15);
  expect(r.historySupportedPredictions).toBeGreaterThan(0);
  expect(r.meanAbsoluteErrorMinutes!).toBeLessThan(r.baselineMAEMinutes!);
 });
 it('03 does not leak observations completed at the same instant',()=>{
  const rows=Array.from({length:5},(_,i)=>record(i,{completedAtUtc:'2026-11-01T12:00:00Z'}));
  const r=evaluateDurationEstimates(owner,rows);
  expect(r).toMatchObject({coldStartPredictions:5,historySupportedPredictions:0,
    meanAbsoluteErrorMinutes:30});
 });
 it('04 excludes invalid/missing-time or extreme actual durations',()=>{
  const r=evaluateDurationEstimates(owner,[
    record(1,{actualMinutes:0}),record(2,{actualMinutes:2000}),
    record(3,{completedAtUtc:'invalid'}),record(4,{actualMinutes:60}),
  ]);
  expect(r).toMatchObject({evaluated:1,filtered:3});
 });
 it('05 rejects foreign account history instead of mixing samples',()=>{
  expect(()=>evaluateDurationEstimates(owner,[record(1,{userId:'other'})])).toThrow(/Mixed-user/);
 });
 it('06 rejects duplicate task IDs that would overstate evidence',()=>{
  expect(()=>evaluateDurationEstimates(owner,[record(1),record(1)])).toThrow(/Duplicate/);
 });
 it('07 honors explicit user estimates when evaluating error',()=>{
  expect(evaluateDurationEstimates(owner,[record(1,{estimatedMinutes:70})]))
    .toMatchObject({meanAbsoluteErrorMinutes:10,baselineMAEMinutes:10,historySupportedPredictions:0});
 });
 it('08 no valid history yields null MAE instead of inventing zero error',()=>{
  expect(evaluateDurationEstimates(owner,[record(1,{actualMinutes:0})])).toMatchObject({
    evaluated:0,filtered:1,meanAbsoluteErrorMinutes:null,baselineMAEMinutes:null,
  });
 });
 it('10 prints reproducible leakage-free synthetic holdout error versus prior baseline',()=>{
  const data=Array.from({length:30},(_,i)=>record(i,{
    completedAtUtc:new Date(Date.UTC(2026,9,2+i,12)).toISOString(),
    actualMinutes:i%2===0?55:65,estimatedMinutes:null,
  }));
  const result=evaluateDurationEstimates(owner,data);
  expect(result.evaluated).toBe(30);
  expect(result.filtered).toBe(0);
  expect(result.historySupportedPredictions).toBeGreaterThan(20);
  expect(result.meanAbsoluteErrorMinutes!).toBeLessThan(result.baselineMAEMinutes!);
  console.log('F2_A03_ESTIMATION_EVAL='+JSON.stringify({
    fixture:'30 chronological completed tasks (synthetic, no production data)',...result,
  }));
 });
 it('09 can evaluate 12 synthetic observations without using AI or remote services',()=>{
  const a=Array.from({length:12},(_,i)=>record(i,{actualMinutes:i%2?55:65}));
  const result=evaluateDurationEstimates(owner,a);
  expect(result.evaluated).toBe(12);
  expect(result.medianAbsoluteErrorMinutes).toBeGreaterThan(0);
  expect(Number.isFinite(result.meanSignedErrorMinutes!)).toBe(true);
 });
});
