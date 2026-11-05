import {expect,it} from 'vitest';
import type {LivePreview} from './live-preview';
import {compareCalendarPlan,calendarComparisonDay,type ComparisonBlock} from './plan-comparison';
const task=(id:string,time:string|null)=>({id,title:id,date:time?'2026-11-06':null,time,minutes:60,locked:false,revision:'2026-11-05T00:00:00Z',lockVersion:null});
const preview=()=>({timezone:'UTC',tasks:[task('a','09:00'),task('b',null)],availability:[{user_id:'owner',start_at:'2026-11-06T08:00:00Z',end_at:'2026-11-06T18:00:00Z'}]} as LivePreview);
it('renders selected manual edits while deselection retains the original time',()=>{
  const read=preview();
  const edits={a:{date:'2026-11-06',time:'14:00',minutes:90,selected:true},b:{date:'2026-11-06',time:'11:00',minutes:30,selected:false}};
  const compared=compareCalendarPlan(read,edits);
  expect(compared.before).toHaveLength(1);expect(compared.after).toHaveLength(1);
  expect(compared.after[0]).toMatchObject({start:Date.parse('2026-11-06T14:00:00Z'),end:Date.parse('2026-11-06T15:30:00Z'),changed:true});
  expect(compareCalendarPlan(read,{...edits,a:{...edits.a,selected:false}}).after).toEqual(compared.before);
});
it('keeps locked blocks fixed and explains overlap, buffer and invalid inputs',()=>{
  const read=preview();read.tasks[0].locked=true;
  const edits={a:{date:'2026-11-06',time:'14:00',minutes:90,selected:true},b:{date:'2026-11-06',time:'09:30',minutes:30,selected:true}};
  expect(compareCalendarPlan(read,edits).after[0].changed).toBe(false);
  expect(compareCalendarPlan(read,edits).issues.b[0]).toMatch(/Conflicts with a/);
  expect(compareCalendarPlan(read,{b:{...edits.b,time:'10:00'}}).issues.b[0]).toMatch(/break/);
  expect(compareCalendarPlan(read,{b:{...edits.b,time:'17:30',minutes:30}}).issues.b[0]).toMatch(/work window/);
  expect(compareCalendarPlan(read,{b:{...edits.b,time:''}}).issues.b[0]).toMatch(/existing local time/);
});
it('clips overnight tasks without changing elapsed duration on DST days',()=>{
  const block:ComparisonBlock={id:'a',title:'Work',start:Date.parse('2026-11-01T04:30:00Z'),end:Date.parse('2026-11-01T07:30:00Z'),locked:false,changed:true};
  const fold=calendarComparisonDay([block],'2026-11-01','America/Toronto');
  expect(fold.minutes).toBe(1500);expect(fold.segments[0].minutes).toBe(180);expect(fold.segments[0].offsetMinutes).toBe(30);
  expect(calendarComparisonDay([],'2027-03-14','America/Toronto').minutes).toBe(1380);
  const overnight={...block,start:Date.parse('2026-11-06T23:30:00Z'),end:Date.parse('2026-11-07T01:00:00Z')};
  expect(calendarComparisonDay([overnight],'2026-11-06','UTC').segments[0].minutes).toBe(30);
  expect(calendarComparisonDay([overnight],'2026-11-07','UTC').segments[0].minutes).toBe(60);
});
it('assigns different lanes to overlapping originals and reuses lanes for adjacent blocks',()=>{
  const a:ComparisonBlock={id:'a',title:'a',start:Date.parse('2026-11-06T09:00Z'),end:Date.parse('2026-11-06T10:00Z'),locked:false,changed:false};
  const b={...a,id:'b',start:a.start+1800000,end:a.end+1800000};
  const c={...a,id:'c',start:a.end+1800000,end:a.end+3600000};
  const day=calendarComparisonDay([a,b,c],'2026-11-06','UTC');
  expect(day.lanes).toBe(2);expect(day.segments.map(x=>x.lane)).toEqual([0,1,0]);
});
