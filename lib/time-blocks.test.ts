import { describe,expect,it } from 'vitest';
import { taskInterval,wallTimeInstants,conflictingTasks,dayBlockLayout } from './time-blocks';
import type { Schedule } from './planning';
const task=(id:string,time='14:00',minutes=90):Schedule=>({id,title:id,scheduled_date:'2026-10-24',scheduled_time:time,estimated_minutes:minutes,is_done:false,deleted_at:null,notes:null,priority:'normal',energy:null,project_id:null,skill_id:null,series_id:null,deferral_reason:null});
describe('time blocks and timezone boundaries',()=>{
 it('represents 14:00–15:30 and allows precise non-blocking overlap warnings',()=>{
  const a=task('a'),b=task('b','15:00',60),c=task('c','15:30',30);
  expect(taskInterval(a,'Asia/Shanghai')?.end).toBe(Date.parse('2026-10-24T07:30:00Z'));
  expect(conflictingTasks(a,[a,b,c],'Asia/Shanghai').map(t=>t.id)).toEqual(['b']);
 });
 it('rejects nonexistent times and chooses the first occurrence in a DST fold',()=>{
  expect(wallTimeInstants('2026-03-08','02:30','America/Toronto')).toEqual([]);
  expect(wallTimeInstants('2026-11-01','01:30','America/Toronto')).toEqual([Date.parse('2026-11-01T05:30:00Z'),Date.parse('2026-11-01T06:30:00Z')]);
 });
 it('uses real elapsed duration across a DST jump',()=>{
  const interval=taskInterval({...task('a','01:30',90),scheduled_date:'2026-03-08'},'America/Toronto')!;
  expect(interval.end-interval.start).toBe(90*60000);expect(interval.end).toBe(Date.parse('2026-03-08T08:00:00Z'));
 });
 it('does not synthesize blocks for undated or unestimated tasks',()=>{
  expect(taskInterval({...task('a'),scheduled_date:null},'UTC')).toBeNull();
  expect(taskInterval({...task('a'),estimated_minutes:null},'UTC')).toBeNull();
 });
});

it('splits overnight blocks and keeps overlapping tasks in distinct lanes',()=>{
 const a={...task('night','23:30',90)},b={...task('overlap','23:45',30)};
 const first=dayBlockLayout([a,b],'2026-10-24','UTC');expect(first.lanes).toBe(2);expect(first.segments[0]).toMatchObject({top:1410,height:30,carries:true});
 expect(dayBlockLayout([a],'2026-10-25','UTC').segments[0]).toMatchObject({top:0,height:60,continued:true});
});
