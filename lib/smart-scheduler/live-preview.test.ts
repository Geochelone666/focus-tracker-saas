import { expect,it } from 'vitest';
import fixture from '../../docs/fixtures/smart-calendar-v01-sample.json';
import { liveCalendarPreview,type CalendarRead } from './live-preview';
const source=():CalendarRead=>({user_id:fixture.snapshot.user_id,captured_at:'2026-11-02T08:00:00Z',timezone:'America/Toronto',revision:'0',version_id:null,undo_receipt_id:null,has_active_focus:false,
  schedules:[{...fixture.snapshot.schedules[0],priority:'high',title:'Plan'}],accepted_ids:[],locked_ids:[]});
const window={date:'2026-11-02',days:1,start:'09:00',end:'17:00'};
it('bounds reads, rejects active focus, ownership mismatch and invalid horizons',()=>{
  const read=source();
  expect(()=>liveCalendarPreview(read,'other',window)).toThrow(/owner/);
  expect(()=>liveCalendarPreview({...read,has_active_focus:true},read.user_id,window)).toThrow(/focus/);
  expect(()=>liveCalendarPreview({...read,schedules:Array(501).fill(read.schedules[0])},read.user_id,window)).toThrow(/500/);
  expect(()=>liveCalendarPreview(read,read.user_id,{...window,days:15})).toThrow(/1–14/);
  expect(()=>liveCalendarPreview(read,read.user_id,{...window,start:'18:00'})).toThrow(/work window/);
});
it('rejects DST gaps and consistently chooses the later repeated work-window start',()=>{
  const read=source();read.schedules=[];
  expect(()=>liveCalendarPreview(read,read.user_id,{date:'2027-03-14',days:1,start:'02:30',end:'04:00'})).toThrow(/does not exist/);
  expect(liveCalendarPreview(read,read.user_id,{date:'2026-11-01',days:1,start:'01:30',end:'04:00'}).availability[0].start_at).toBe('2026-11-01T06:30:00.000Z');
});
it('excludes a locked inbox task and preserves a manually timed task as fixed',()=>{
  const read=source();read.locked_ids=[read.schedules[0].id];
  expect(liveCalendarPreview(read,read.user_id,window).output.placements).toEqual([]);
  read.locked_ids=[];read.schedules[0].scheduled_date=window.date;read.schedules[0].scheduled_time='10:00:00';
  expect(liveCalendarPreview(read,read.user_id,window).output.placements).toEqual([]);
});
