import { describe, expect, it } from 'vitest';
import fixture from '../../docs/fixtures/smart-calendar-v01-sample.json';
import {
  adaptFocusSnapshot, localDeadlineExclusiveUtc, previewSmartCalendar,
  SnapshotValidationError, type SmartCalendarSnapshotV01, type FocusScheduleRow,
} from './focus-adapter';
import { inspectActualScheduler, verifyActualScheduler } from './qa-bridge';
import { scheduleTasks } from './engine';
import { wallTimeInstants } from '../wall-time';

const snapshot=():SmartCalendarSnapshotV01=>structuredClone(fixture.snapshot) as SmartCalendarSnapshotV01;
const id=(i:number)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
const meeting=(s:SmartCalendarSnapshotV01)=>s.schedules.find(row=>row.id===id(4))!;
const extra=(s:SmartCalendarSnapshotV01,i:number,changes:Partial<FocusScheduleRow>={}):FocusScheduleRow=>({
  ...s.schedules[0],id:id(i),updated_at:`2026-11-01T10:00:${String(i%60).padStart(2,'0')}.123456Z`,
  priority:'normal',estimated_minutes:null,scheduled_date:null,scheduled_time:null,
  deadline:null,deferral_count:0, ...changes,
});
const session=(s:SmartCalendarSnapshotV01,i:number,taskId:string,sec=3600)=>({
  id:`session-${i}`,user_id:s.user_id,schedule_id:taskId,
  session_kind:'focus' as const,focus_status:'completed' as const,
  duration_sec:sec,ended_at:`2026-11-01T${String(10+i).padStart(2,'0')}:00:00Z`,
});

describe('F2-A03 Focus-owned data adapter + actual independent QA #72 oracle',()=>{
 it('01 runs the real F2-A02 engine from canonical Focus rows, matching shared wire fixture',()=>{
  const result=previewSmartCalendar(snapshot());
  expect(result.output.schema_version).toBe('smart-calendar/v0.1');
  expect(result.output.algorithm_version).toBe(fixture.expected.algorithm_version);
  expect(result.output.placements.map(p=>({schedule_id:p.schedule_id,start_at:p.start_at,end_at:p.end_at})))
    .toEqual(fixture.expected.placements);
  expect(result.output.unplaced).toEqual([]);
  expect(result.output.metrics.hardViolations).toBe(0);
  expect(result.output.input_fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
 });
 it('02 feeds actual engine output into QA oracle (no mock result)',()=>{
  const {raw,adapted}=previewSmartCalendar(snapshot());
  expect(inspectActualScheduler(adapted.engineInput,raw)).toEqual([]);
 });
 it('03 actual double execution is deterministic and keeps frozen accepted placement',()=>{
  const a=adaptFocusSnapshot(snapshot());
  const verified=verifyActualScheduler(a.engineInput,[id(3)]);
  expect(verified.issues).toEqual([]);
  expect(verified.deterministic).toBe(true);
  expect(verified.frozenIssues).toEqual([]);
 });
 it('04 exact microsecond update revision is preserved for CAS wire payload',()=>{
  expect(previewSmartCalendar(snapshot()).output.placements.find(p=>p.schedule_id===id(3))?.expected_updated_at)
    .toBe('2026-11-01T02:03:03.123456Z');
 });
 it('05 manual timed task becomes a fixed block, never an engine candidate',()=>{
  const adapted=adaptFocusSnapshot(snapshot());
  expect(adapted.engineInput.tasks.map(t=>t.id)).not.toContain(id(4));
  expect(adapted.engineInput.fixedBlocks).toEqual(expect.arrayContaining([
    expect.objectContaining({id:'manual:'+id(4),kind:'locked',startUtc:'2026-11-02T15:00:00.000Z',endUtc:'2026-11-02T16:00:00.000Z'}),
  ]));
 });
 it('06 date-only local task remains on the chosen local day',()=>{
  const adapted=adaptFocusSnapshot(snapshot());
  const dated=adapted.engineInput.tasks.find(t=>t.id===id(2))!;
  expect(dated.earliestStartUtc).toBe('2026-11-02T05:00:00.000Z');
  expect(dated.deadlineUtc).toBe('2026-11-03T05:00:00.000Z');
 });
 it('07 Toronto spring-forward local deadlines use next real midnight',()=>{
  expect(localDeadlineExclusiveUtc('2026-03-08','America/Toronto')).toBe('2026-03-09T04:00:00.000Z');
 });
 it('08 Toronto fall-back local deadlines use next real midnight',()=>{
  expect(localDeadlineExclusiveUtc('2026-11-01','America/Toronto')).toBe('2026-11-02T05:00:00.000Z');
 });
 it('09 rejects foreign schedule row before scheduling',()=>{
  const s=snapshot();s.schedules[0].user_id='another-owner';
  expect(()=>adaptFocusSnapshot(s)).toThrowError(SnapshotValidationError);
 });
 it('10 rejects foreign fixed events',()=>{
  const s=snapshot();s.busy_intervals.push({user_id:'another-owner',source_id:'x',kind:'external',
    start_at:'2026-11-02T13:00:00Z',end_at:'2026-11-02T14:00:00Z'});
  expect(()=>adaptFocusSnapshot(s)).toThrow(/foreign interval/i);
 });
 it('11 rejects foreign availability instead of dropping it',()=>{
  const s=snapshot();s.availability[0].user_id='another-owner';
  expect(()=>adaptFocusSnapshot(s)).toThrow(/foreign interval/i);
 });
 it('12 rejects foreign accepted placement',()=>{
  const s=snapshot();s.accepted_blocks[0].user_id='another-owner';
  expect(()=>adaptFocusSnapshot(s)).toThrow(/foreign interval/i);
 });
 it('13 rejects foreign focus observations even if they are not completed',()=>{
  const s=snapshot();s.focus_sessions.push({...session(s,1,id(1)),user_id:'another-owner',focus_status:'abandoned'});
  expect(()=>adaptFocusSnapshot(s)).toThrow(/foreign focus session/i);
 });
 it('14 requires active focus to have a bounded reservation',()=>{
  const s=snapshot();s.busy_intervals.push({user_id:s.user_id,source_id:'active',kind:'active_focus',
    start_at:'2026-11-02T17:00:00Z',end_at:''});
  expect(()=>adaptFocusSnapshot(s)).toThrow(/known end/i);
 });
 it('15 fails closed when an existing manual timed task lacks duration',()=>{
  const s=snapshot();meeting(s).estimated_minutes=null;
  expect(()=>adaptFocusSnapshot(s)).toThrow(/needs explicit duration/i);
 });
 it('16 rejects invalid IANA timezone instead of silently falling back',()=>{
  const s=snapshot();s.timezone='Not/A_Zone';
  expect(()=>adaptFocusSnapshot(s)).toThrow(/IANA/i);
 });
 it('17 rejects a stale accepted task revision',()=>{
  const s=snapshot();s.accepted_blocks[0].expected_updated_at='2026-11-01T01:00:00.000000Z';
  expect(()=>adaptFocusSnapshot(s)).toThrow(/stale task revision/i);
 });
 it('18 rejects accepted placements from a different plan version',()=>{
  const s=snapshot();s.accepted_blocks[0].version_id='another-version';
  expect(()=>adaptFocusSnapshot(s)).toThrow(/base version/i);
 });
 it('19 a spring DST gap cannot become a real manual block',()=>{
  const s=snapshot();s.schedules[3].scheduled_date='2026-03-08';s.schedules[3].scheduled_time='02:30';
  expect(wallTimeInstants('2026-03-08','02:30','America/Toronto')).toEqual([]);
  expect(()=>adaptFocusSnapshot(s)).toThrow(/Nonexistent local/i);
 });
 it('20 ambiguous fall-back wall time uses the second Toronto instant',()=>{
  const s=snapshot();s.schedules[3].scheduled_date='2026-11-01';s.schedules[3].scheduled_time='01:30';
  const block=adaptFocusSnapshot(s).engineInput.fixedBlocks.find(b=>b.id==='manual:'+id(4));
  expect(block?.startUtc).toBe('2026-11-01T06:30:00.000Z');
 });
 it('21 returns explained unplaced tasks when all availability is blocked',()=>{
  const s=snapshot();s.accepted_blocks=[];s.base_version_id=null;
  s.busy_intervals.push({user_id:s.user_id,source_id:'all',kind:'locked',
    start_at:'2026-11-02T14:00:00Z',end_at:'2026-11-02T20:00:00Z'});
  const {raw,adapted}=previewSmartCalendar(s);
  expect(raw.placements).toHaveLength(0);
  expect(raw.unplaced).toHaveLength(3);
  expect(inspectActualScheduler(adapted.engineInput,raw)).toEqual([]);
 });
 it('22 completed tasks are not scheduled and can contribute historical estimates',()=>{
  const s=snapshot();
  for(const n of [5,6,7]){
    s.schedules.push(extra(s,n,{is_done:true,estimated_minutes:50,completed_at:'2026-11-01T18:00:00Z'}));
    s.focus_sessions.push(session(s,n,id(n),60*60));
  }
  const {raw,adapted}=previewSmartCalendar(s);
  expect(adapted.historicalSampleCount).toBe(3);
  expect(raw.placements.find(p=>p.taskId===id(2))?.estimateSource).toBe('history_global');
  expect(raw.placements.some(p=>[5,6,7].map(id).includes(p.taskId))).toBe(false);
 });
 it('23 multiple focus sessions on a completed task count as ONE actual duration sample',()=>{
  const s=snapshot();s.schedules.push(extra(s,5,{is_done:true,estimated_minutes:50}));
  s.focus_sessions.push(session(s,1,id(5),25*60),session(s,2,id(5),35*60));
  const a=adaptFocusSnapshot(s);
  expect(a.historicalSampleCount).toBe(1);
  expect(a.engineInput.tasks.find(t=>t.id===id(2))?.durationSamples).toEqual([
    {minutes:60,projectId:null,skillId:null},
  ]);
 });
 it('24 excludes abandoned sessions, breaks, implausible seconds and unattached history',()=>{
  const s=snapshot();s.schedules.push(extra(s,5,{is_done:true,estimated_minutes:60}));
  s.focus_sessions.push({...session(s,1,id(5)),session_kind:'short_break'},
    {...session(s,2,id(5)),focus_status:'abandoned'},
    {...session(s,3,id(5)),duration_sec:-1},
    {...session(s,4,id(5)),duration_sec:999999},
    session(s,5,'missing-schedule'));
  expect(adaptFocusSnapshot(s).historicalSampleCount).toBe(0);
 });
 it('25 duplicate session IDs are rejected to prevent double-counting',()=>{
  const s=snapshot();const f=session(s,1,id(1));s.focus_sessions.push(f,f);
  expect(()=>adaptFocusSnapshot(s)).toThrow(/Duplicate focus session/);
 });
 it('26 changing an unselected fixed event invalidates input fingerprint',()=>{
  const s=snapshot();const old=adaptFocusSnapshot(s).inputFingerprint;
  meeting(s).scheduled_time='10:30';
  expect(adaptFocusSnapshot(s).inputFingerprint).not.toBe(old);
 });
 it('27 identical records in different read order have the same fingerprint',()=>{
  const s=snapshot(),original=adaptFocusSnapshot(s).inputFingerprint;
  s.schedules.reverse();s.availability.reverse();s.accepted_blocks.reverse();
  expect(adaptFocusSnapshot(s).inputFingerprint).toBe(original);
 });
 it('28 undo then re-preview reuses the restored confirmed plan without moving unrelated tasks',()=>{
  const s=snapshot();const accepted=s.accepted_blocks[0];
  s.busy_intervals.push({user_id:s.user_id,source_id:'temporary',kind:'external',
    start_at:'2026-11-02T18:00:00Z',end_at:'2026-11-02T19:00:00Z'});
  const moved=previewSmartCalendar(s);
  expect(moved.output.placements.find(p=>p.schedule_id===id(3))?.start_at).not.toBe(accepted.start_at);
  s.busy_intervals.pop(); // simulated external undo/discard; no database writes.
  const restored=previewSmartCalendar(s);
  expect(restored.output.placements.find(p=>p.schedule_id===id(3))?.start_at).toBe(accepted.start_at);
  expect(verifyActualScheduler(restored.adapted.engineInput,[id(3)]).frozenIssues).toEqual([]);
 });
 it('29 two distinct task revisions never silently collapse into same preview fingerprint',()=>{
  const s=snapshot(),a=adaptFocusSnapshot(s).inputFingerprint;
  s.schedules[0].updated_at='2026-11-01T02:03:01.123457Z';
  expect(adaptFocusSnapshot(s).inputFingerprint).not.toBe(a);
 });
 it('30 respects local date-only hard limit if no window remains on that day',()=>{
  const s=snapshot();s.availability=[{user_id:s.user_id,start_at:'2026-11-03T14:00:00Z',end_at:'2026-11-03T20:00:00Z'}];
  s.window.end_at='2026-11-04T05:00:00Z';
  s.accepted_blocks=[];s.base_version_id=null;
  const {raw,adapted}=previewSmartCalendar(s);
  expect(raw.unplaced.map(x=>x.taskId)).toContain(id(2));
  expect(inspectActualScheduler(adapted.engineInput,raw)).toEqual([]);
 });
 it('31 rejects duplicate task IDs from the same account',()=>{
  const s=snapshot();s.schedules.push({...s.schedules[0]});
  expect(()=>adaptFocusSnapshot(s)).toThrow(/Duplicate schedule/i);
 });
 it('32 handles no available time with a QA-validated explanation',()=>{
  const s=snapshot();s.availability=[];
  const {raw,adapted}=previewSmartCalendar(s);
  expect(raw.placements).toHaveLength(0);
  expect(inspectActualScheduler(adapted.engineInput,raw)).toEqual([]);
 });
 it('33 preserves task priority and deferral counter from actual schedule fields',()=>{
  const t=adaptFocusSnapshot(snapshot()).engineInput.tasks.find(x=>x.id===id(1));
  expect(t).toMatchObject({priority:'high',estimatedMinutes:60,deferralCount:0});
 });
 it('34 actual engine output is stable across equivalent input ordering',()=>{
  const s=snapshot();const first=previewSmartCalendar(s).raw;
  s.schedules.reverse();
  expect(scheduleTasks(adaptFocusSnapshot(s).engineInput)).toEqual(first);
 });
});
