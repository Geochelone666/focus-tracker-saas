import { describe, expect, it } from 'vitest';
import { auditSchedule, scheduleTasks } from './engine';
import type { AcceptedPlacement, SchedulerInput, SchedulerTask, UtcInterval } from './types';
import { wallTimeInstants } from '../wall-time';

const at = (hour: number, minute = 0, day = 2) =>
  new Date(Date.UTC(2026,10,day,hour,minute)).toISOString();
const interval = (from: number, to: number, day = 2): UtcInterval =>
  ({ startUtc: at(from,0,day), endUtc: at(to,0,day) });
const task = (id: string, extra: Partial<SchedulerTask> = {}): SchedulerTask =>
  ({ id, priority: 'normal', estimatedMinutes: 30, ...extra });
const input = (tasks: SchedulerTask[], extra: Partial<SchedulerInput> = {}): SchedulerInput =>
  ({ nowUtc: at(8), inputRevision:'rev-1',tasks,availability:[interval(9,17)],
    fixedBlocks:[],policy:{slotMinutes:15,breakMinutes:5}, ...extra });
const find = (output: ReturnType<typeof scheduleTasks>, id: string) =>
  output.placements.find(p=>p.taskId===id);

describe('Smart Scheduler v1: feasible deterministic planning', () => {
  it('01 places a task at the first possible slot', () => {
    const result=scheduleTasks(input([task('a')]));
    expect(find(result,'a')?.startUtc).toBe(at(9));
    expect(result.metrics.hardViolations).toBe(0);
  });
  it('02 ranks high priority ahead of normal', () => {
    const result=scheduleTasks(input([task('normal'),task('high',{priority:'high'})]));
    expect(result.placements[0].taskId).toBe('high');
  });
  it('03 urgent deadline can outrank a less urgent high priority task', () => {
    const result=scheduleTasks(input([task('high',{priority:'high'}),task('urgent',{deadlineUtc:at(10)})]));
    expect(find(result,'urgent')?.startUtc).toBe(at(9));
  });
  it('04 avoids fixed events', () => {
    const result=scheduleTasks(input([task('a')],{fixedBlocks:[{id:'meeting',kind:'event',...interval(9,10)}]}));
    expect(find(result,'a')?.startUtc).toBe(at(10));
  });
  it('05 reserves mandatory rest buffers between tasks', () => {
    const result=scheduleTasks(input([task('a'),task('b')],{policy:{breakMinutes:15}}));
    expect(result.placements.map(p=>p.startUtc)).toEqual([at(9),at(9,45)]);
  });
  it('06 buffer cannot run into a fixed event', () => {
    const result=scheduleTasks(input([task('a')],{fixedBlocks:[{id:'event',kind:'event',startUtc:at(9,30),endUtc:at(10)}]}));
    expect(find(result,'a')?.startUtc).toBe(at(10));
  });
  it('07 permits a task ending exactly at the deadline with zero buffer', () => {
    const result=scheduleTasks(input([task('a',{deadlineUtc:at(9,30)})],{policy:{breakMinutes:0}}));
    expect(find(result,'a')?.endUtc).toBe(at(9,30));
  });
  it('08 refuses past hard deadlines', () => {
    const result=scheduleTasks(input([task('past',{deadlineUtc:at(7)})]));
    expect(result.unplaced).toEqual([{taskId:'past',reasonCode:'DEADLINE_IN_PAST'}]);
  });
  it('09 respects earliest allowable start', () => {
    const result=scheduleTasks(input([task('a',{earliestStartUtc:at(11)})]));
    expect(find(result,'a')?.startUtc).toBe(at(11));
  });
  it('10 rejects earliest start at the deadline', () => {
    const result=scheduleTasks(input([task('a',{earliestStartUtc:at(11),deadlineUtc:at(11)})]));
    expect(result.unplaced[0].reasonCode).toBe('EARLIEST_START_UNREACHABLE');
  });
  it('11 reports impossible deadline without silently moving it', () => {
    const result=scheduleTasks(input([task('a',{deadlineUtc:at(9,10)})]));
    expect(result.unplaced[0].reasonCode).toBe('HARD_DEADLINE_UNREACHABLE');
  });
  it('12 reports no available windows', () => {
    const result=scheduleTasks(input([task('a')],{availability:[]}));
    expect(result.unplaced[0].reasonCode).toBe('NO_AVAILABILITY');
  });
  it('13 reports fully occupied availability', () => {
    const result=scheduleTasks(input([task('a')],{fixedBlocks:[{id:'busy',kind:'locked',...interval(9,17)}]}));
    expect(result.unplaced[0].reasonCode).toBe('NO_CONTIGUOUS_SLOT');
  });
  it('14 preserves locked blocks independently of task priority', () => {
    const result=scheduleTasks(input([task('urgent',{priority:'high'})],{
      fixedBlocks:[{id:'locked',kind:'locked',...interval(9,16,)}]}));
    expect(find(result,'urgent')?.startUtc).toBe(at(16));
    expect(result.metrics.hardViolations).toBe(0);
  });
  it('15 respects softer preferred windows without expanding availability', () => {
    const result=scheduleTasks(input([task('a')],{preferredWindows:[interval(12,13)]}));
    expect(find(result,'a')?.startUtc).toBe(at(12));
    expect(find(result,'a')?.reasonCodes).toContain('PREFERRED_WINDOW');
  });
  it('16 ignores preferred windows with no feasible time', () => {
    const result=scheduleTasks(input([task('a')],{preferredWindows:[interval(20,21)]}));
    expect(find(result,'a')?.startUtc).toBe(at(9));
  });
  it('17 retains a previously accepted feasible placement', () => {
    const old:AcceptedPlacement={taskId:'a',startUtc:at(14),endUtc:at(14,30)};
    const result=scheduleTasks(input([task('a')],{previousPlacements:[old]}));
    expect(find(result,'a')?.startUtc).toBe(at(14));
    expect(result.changes).toHaveLength(0);
  });
  it('18 locally repairs an accepted block when a new event conflicts', () => {
    const old={taskId:'a',startUtc:at(10),endUtc:at(10,30)};
    const result=scheduleTasks(input([task('a')],{previousPlacements:[old],
      fixedBlocks:[{id:'meeting',kind:'event',...interval(10,11)}]}));
    expect(find(result,'a')?.startUtc).toBe(at(9));
    expect(result.changes.map(c=>c.taskId)).toEqual(['a']);
    expect(result.metrics.hardViolations).toBe(0);
  });
  it('19 does not move unrelated accepted blocks', () => {
    const result=scheduleTasks(input([task('a'),task('b'),task('c')],{
      previousPlacements:[
        {taskId:'a',startUtc:at(10),endUtc:at(10,30)},
        {taskId:'b',startUtc:at(13),endUtc:at(13,30)}],
      fixedBlocks:[{id:'new',kind:'event',...interval(10,11)}]}));
    expect(find(result,'b')?.startUtc).toBe(at(13));
    expect(result.changes.some(c=>c.taskId==='b')).toBe(false);
  });
  it('20 rejects accepted intervals with stale duration and recalculates', () => {
    const result=scheduleTasks(input([task('a',{estimatedMinutes:60})],{
      previousPlacements:[{taskId:'a',startUtc:at(11),endUtc:at(11,30)}]}));
    expect(find(result,'a')?.startUtc).toBe(at(9));
    expect(result.metrics.movedAcceptedTasks).toBe(1);
  });
  it('21 excludes completed tasks', () => {
    const result=scheduleTasks(input([task('done',{completed:true}),task('open')]));
    expect(result.metrics.eligibleTasks).toBe(1);
    expect(find(result,'done')).toBeUndefined();
  });
  it('22 excludes deleted tasks', () => {
    const result=scheduleTasks(input([task('trash',{deleted:true})]));
    expect(result.placements).toHaveLength(0);
  });
  it('23 rejects invalid explicit estimates', () => {
    const result=scheduleTasks(input([task('a',{estimatedMinutes:0})]));
    expect(result.unplaced[0].reasonCode).toBe('INVALID_ESTIMATE');
  });
  it('24 marks cold-start estimates as defaults', () => {
    const result=scheduleTasks(input([task('a',{estimatedMinutes:null})]));
    expect(find(result,'a')).toMatchObject({estimatedMinutes:30,estimateSource:'default'});
    expect(find(result,'a')?.reasonCodes).toContain('DEFAULT_ESTIMATE');
  });
  it('25 uses real provided history without AI API', () => {
    const result=scheduleTasks(input([task('a',{estimatedMinutes:null,skillId:'math',
      durationSamples:Array.from({length:12},()=>({minutes:50,skillId:'math'}))})]));
    expect(find(result,'a')?.estimateSource).toBe('history_skill');
    expect(find(result,'a')?.reasonCodes).toContain('PERSONALIZED_ESTIMATE');
  });
  it('26 produces byte-identical output for repeated runs', () => {
    const payload=input([task('a'),task('b'),task('c')]);
    expect(JSON.stringify(scheduleTasks(payload))).toBe(JSON.stringify(scheduleTasks(payload)));
  });
  it('27 does not mutate inputs', () => {
    const payload=input([task('a')]);
    const before=JSON.stringify(payload);
    scheduleTasks(payload);
    expect(JSON.stringify(payload)).toBe(before);
  });
  it('28 rejects duplicated task IDs', () => {
    expect(()=>scheduleTasks(input([task('x'),task('x')]))).toThrow('Duplicate');
  });
  it('29 rejects malformed availability intervals', () => {
    expect(()=>scheduleTasks(input([task('a')],{availability:[{startUtc:at(11),endUtc:at(9)}]}))).toThrow('Invalid interval');
  });
  it('30 spring DST gap has no valid Toronto instant', () => {
    expect(wallTimeInstants('2026-03-08','02:30','America/Toronto')).toEqual([]);
  });
  it('31 fall DST fold uses the second instant, matching existing reminder policy', () => {
    const fold=wallTimeInstants('2026-11-01','01:30','America/Toronto');
    expect(fold).toHaveLength(2);
    const start=new Date(fold[1]).toISOString();
    const end=new Date(fold[1]+30*60_000).toISOString();
    const result=scheduleTasks(input([task('fold')],{nowUtc:'2026-11-01T06:00:00.000Z',
      availability:[{startUtc:start,endUtc:'2026-11-01T08:00:00.000Z'}],
      previousPlacements:[{taskId:'fold',startUtc:start,endUtc:end}]}));
    expect(find(result,'fold')?.startUtc).toBe('2026-11-01T06:30:00.000Z');
  });
  it('32 schedules a real overnight block without splitting its duration', () => {
    const start=at(23,30),end=at(1,0,3);
    const result=scheduleTasks(input([task('overnight',{estimatedMinutes:90})],{
      nowUtc:at(22),availability:[{startUtc:start,endUtc:at(2,0,3)}]}));
    expect(find(result,'overnight')?.endUtc).toBe(end);
  });
  it('33 independent auditor catches a forged overlapping output', () => {
    const payload=input([task('a'),task('b')]); const result=scheduleTasks(payload);
    const tampered={...result,placements:[result.placements[0],{...result.placements[1],
      startUtc:result.placements[0].startUtc,endUtc:result.placements[0].endUtc}]};
    expect(auditSchedule(payload,tampered)).toBeGreaterThan(0);
  });
  it('34 warns of existing overlapping fixed events without moving them', () => {
    const result=scheduleTasks(input([task('a')],{fixedBlocks:[
      {id:'x',kind:'event',...interval(9,11)},
      {id:'y',kind:'event',...interval(10,12)}]}));
    expect(result.warnings).toContain('FIXED_BLOCKS_OVERLAP');
    expect(find(result,'a')?.startUtc).toBe(at(12));
  });
  it('35 handles an accepted placement that now violates its deadline', () => {
    const result=scheduleTasks(input([task('a',{deadlineUtc:at(12)})],{
      previousPlacements:[{taskId:'a',startUtc:at(14),endUtc:at(14,30)}]}));
    expect(find(result,'a')?.startUtc).toBe(at(9));
  });
  it('36 an unchanged accepted plan has less disruption than a from-scratch baseline', () => {
    const payload=input([task('a'),task('b')],{previousPlacements:[
      {taskId:'a',startUtc:at(13),endUtc:at(13,30)},
      {taskId:'b',startUtc:at(14),endUtc:at(14,30)}]});
    expect(scheduleTasks(payload).metrics.movedAcceptedTasks).toBe(0);
    expect(scheduleTasks(payload,'baseline').metrics.movedAcceptedTasks).toBe(2);
  });
  it('37 rejects unparseable timestamps', () => {
    expect(()=>scheduleTasks(input([task('a')],{nowUtc:'2026-02-30T08:00:00Z'}))).toThrow();
  });
  it('38 no previous plan and no preferences cannot violate constraints', () => {
    const payload=input(Array.from({length:22},(_,i)=>task(String(i),{estimatedMinutes:30})));
    const opt=scheduleTasks(payload),base=scheduleTasks(payload,'baseline');
    expect(opt.metrics.hardViolations).toBe(0);
    expect(base.metrics.hardViolations).toBe(0);
    expect(opt.metrics.coverageRatio).toBeGreaterThanOrEqual(base.metrics.coverageRatio);
  });
  it('39 keeps half-open adjacent fixed events valid', () => {
    const result=scheduleTasks(input([task('a')],{fixedBlocks:[
      {id:'a',kind:'event',...interval(9,10)},
      {id:'b',kind:'event',...interval(10,11)}]}));
    expect(result.warnings).not.toContain('FIXED_BLOCKS_OVERLAP');
  });
  it('40 rejects a deadline at or before now even if some time slots exist', () => {
    const result=scheduleTasks(input([task('a',{deadlineUtc:at(8)})]));
    expect(result.placements).toHaveLength(0);
  });
});
