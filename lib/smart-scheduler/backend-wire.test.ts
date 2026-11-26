import { describe, expect, it } from 'vitest';
import fixture from '../../docs/fixtures/smart-calendar-v01-sample.json';
import { previewSmartCalendar, type SmartCalendarSnapshotV01, type SmartCalendarOutputV01 } from './focus-adapter';
import {
  changedPlacementsToLegacyBatch,placementToLegacyBatchChange,LegacyWireError,
} from './backend-wire';
const snapshot=()=>structuredClone(fixture.snapshot) as SmartCalendarSnapshotV01;
const valid=(start:string,end:string)=>({
  schedule_id:'00000000-0000-4000-8000-000000000009',
  expected_updated_at:'2026-11-01T02:03:09.123456Z',start_at:start,end_at:end,
  reason_codes:['EARLIEST_FEASIBLE' as const],locked:false as const,
  estimate_source:'user' as const,
});
describe('F2-A03 vetted legacy backend RPC encoding (no database writes)',()=>{
 it('01 converts real preview placements into local fields while retaining microsecond revisions',()=>{
  const {output}=previewSmartCalendar(snapshot());
  const batch=changedPlacementsToLegacyBatch(output,'America/Toronto');
  expect(batch).toHaveLength(2); // third candidate is an unchanged accepted block.
  expect(batch[0]).toEqual({
    id:fixture.expected.placements[0].schedule_id,
    expected_updated_at:'2026-11-01T02:03:01.123456Z',
    scheduled_date:'2026-11-02',scheduled_time:'09:00',estimated_minutes:60,
  });
 });
 it('02 protects the first repeated Toronto 01:30 from an ambiguous local RPC write',()=>{
  expect(()=>placementToLegacyBatchChange(
    valid('2026-11-01T05:30:00.000Z','2026-11-01T06:00:00.000Z'),
    'America/Toronto',
  )).toThrowError(LegacyWireError);
 });
 it('03 permits the later standard-time occurrence of the same local 01:30',()=>{
  expect(placementToLegacyBatchChange(
    valid('2026-11-01T06:30:00.000Z','2026-11-01T07:00:00.000Z'),
    'America/Toronto',
  )).toMatchObject({scheduled_date:'2026-11-01',scheduled_time:'01:30',estimated_minutes:30});
 });
 it('04 preserves elapsed duration across spring-forward jump',()=>{
  expect(placementToLegacyBatchChange(
    valid('2026-03-08T06:30:00.000Z','2026-03-08T08:00:00.000Z'),
    'America/Toronto',
  )).toMatchObject({scheduled_date:'2026-03-08',scheduled_time:'01:30',estimated_minutes:90});
 });
 it('05 rejects invalid IANA zone rather than guessing Toronto',()=>{
  expect(()=>placementToLegacyBatchChange(valid('2026-11-02T14:00:00Z','2026-11-02T15:00:00Z'),'Not/AZone'))
    .toThrow(/Invalid IANA/);
 });
 it('06 rejects subminute UTC placements current RPC cannot express exactly',()=>{
  expect(()=>placementToLegacyBatchChange(
    valid('2026-11-02T14:00:30Z','2026-11-02T15:00:30Z'),'America/Toronto'))
    .toThrow(/Invalid candidate/);
 });
 it('07 refuses silently splitting an atomic plan beyond 50 changed tasks',()=>{
  const output=previewSmartCalendar(snapshot()).output;
  const extra=Array.from({length:51},(_,i)=>({
    schedule_id:'additional-'+i,before:null,
    after:{startUtc:'2026-11-02T14:00:00Z',endUtc:'2026-11-02T15:00:00Z'},
  }));
  const synthetic:SmartCalendarOutputV01={...output,changes:extra};
  expect(()=>changedPlacementsToLegacyBatch(synthetic,'America/Toronto'))
    .toThrow(/at most 50/);
 });
 it('08 rejects an unplaced previously accepted task rather than omitting its removal',()=>{
  const output=previewSmartCalendar(snapshot()).output;
  const synthetic:SmartCalendarOutputV01={...output,changes:[
    {schedule_id:'a',before:{startUtc:'2026-11-02T14:00:00Z',endUtc:'2026-11-02T15:00:00Z'},after:null},
  ]};
  expect(()=>changedPlacementsToLegacyBatch(synthetic,'America/Toronto'))
    .toThrow(/cannot clear/);
 });
 it('09 returns an empty candidate write when nothing changed',()=>{
  const output=previewSmartCalendar(snapshot()).output;
  expect(changedPlacementsToLegacyBatch({...output,changes:[]},'America/Toronto')).toEqual([]);
 });
});
