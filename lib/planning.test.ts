import { describe, expect, it } from 'vitest';
import { addDays, dueSoon, dayKey, parsePlan, plannedMinutes, recurrenceDates, sortPlans, timezone, type Schedule } from './planning';
import { buildAnalyticsDays, getDateKey, groupSecondsByDay } from './analytics';
const id = '11111111-1111-4111-8111-111111111111';
function form(fields: Record<string,string | undefined> = {}) { const data = new FormData(); data.set('title','Read a chapter'); for(const [k,v] of Object.entries(fields)) if(v !== undefined) data.set(k,v); return data; }
const plan = (fields: Partial<Schedule> = {}): Schedule => ({id,title:'Plan',scheduled_date:null,scheduled_time:null,notes:null,is_done:false,priority:'normal',estimated_minutes:null,energy:null,project_id:null,skill_id:null,series_id:null,deleted_at:null,deferral_reason:null,...fields});
describe('planning input and recurrence', () => {
  it('captures a title-only task into the inbox', () => expect(parsePlan(form())).toMatchObject({title:'Read a chapter',scheduled_date:null,scheduled_time:null,priority:'normal'}));
  it('accepts duration, energy, and project/skill links', () => expect(parsePlan(form({estimated_minutes:'25',energy:'low',project_id:id,skill_id:id}))).toMatchObject({estimated_minutes:25,energy:'low',project_id:id,skill_id:id}));
  it.each([{scheduled_time:'09:00'},{scheduled_date:'2026-02-29'},{estimated_minutes:'1.5'},{estimated_minutes:'1441'},{project_id:'bad'},{energy:'exhausted'},{priority:'urgent'}])('rejects invalid options %j', fields => expect(()=>parsePlan(form(fields))).toThrow());
  it('creates bounded daily and weekly occurrences across leap day', () => {
    expect(recurrenceDates('2028-02-28','daily',3)).toEqual(['2028-02-28','2028-02-29','2028-03-01']);
    expect(recurrenceDates('2026-12-28','weekly',2)).toEqual(['2026-12-28','2027-01-04']);
    expect(recurrenceDates(null,'none',12)).toEqual([null]);
  });
  it.each([[null,'daily',2],['2026-10-20','daily',53],['2026-10-20','daily',1],['9998-12-31','weekly',2],['2026-10-20','monthly',2]])('rejects invalid recurrence %j %s %i', (date,repeat,count)=>expect(()=>recurrenceDates(date as string|null,repeat as string,count as number)).toThrow());
  it('prioritizes open and high-priority tasks and adds buffers only for open tasks', () => {
    const items=[plan({id:'done',is_done:true,estimated_minutes:100}),plan({id:'normal',estimated_minutes:20}),plan({id:'high',priority:'high',estimated_minutes:30})];
    expect(sortPlans(items).map(p=>p.id)).toEqual(['high','normal','done']);
    expect(plannedMinutes(items,5)).toBe(60);
  });
});
describe('timezone-aware planning', () => {
  it('uses the configured timezone at UTC day boundaries', () => {
    const now=new Date('2026-10-20T02:00:00Z');
    expect(dayKey(now,'America/Toronto')).toBe('2026-10-19');
    expect(dayKey(now,'Asia/Shanghai')).toBe('2026-10-20');
    expect(getDateKey(now,'Asia/Shanghai')).toBe('2026-10-20');
    expect(buildAnalyticsDays(now,'Asia/Shanghai').at(-1)?.key).toBe('2026-10-20');
    expect(groupSecondsByDay([{started_at:now.toISOString(),duration_sec:60}],['2026-10-20'],'Asia/Shanghai').get('2026-10-20')).toBe(60);
  });
  it('falls back safely on invalid timezone settings',()=>expect(timezone('not/a/timezone')).toBe('America/Toronto'));
  it('adds calendar days across DST without shifting the date',()=>expect(addDays('2026-03-08',1)).toBe('2026-03-09'));
  it('reminds only for valid timed plans due in the next ten minutes',()=>{
    const items=[{id:'a',title:'Soon',scheduled_date:'2026-10-20',scheduled_time:'09:10:00'},{id:'b',title:'Later',scheduled_date:'2026-10-20',scheduled_time:'09:11:00'},{id:'c',title:'Untimed',scheduled_date:'2026-10-20',scheduled_time:null}];
    expect(dueSoon(items,new Date('2026-10-20T13:00:00Z'),'America/Toronto').map(p=>p.id)).toEqual(['a']);
  });
});
