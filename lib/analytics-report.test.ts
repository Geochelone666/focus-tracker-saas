import {describe,it,expect} from 'vitest';
import {reportRange,taskVariance} from './analytics-report';
describe('planned versus actual semantics',()=>{
 it('shows +30m for a 60m estimate and 90m of actual focus',()=>expect(taskVariance({estimated_minutes:60,actual_seconds:5400})).toBe(30));
 it('does not invent a variance for missing actuals or estimates',()=>{
  expect(taskVariance({estimated_minutes:60,actual_seconds:null})).toBeNull();expect(taskVariance({estimated_minutes:null,actual_seconds:300})).toBeNull();
 });
 it('bounds ranges and handles month/year changes',()=>{
  expect(reportRange({range:'30'},'2027-01-02')).toMatchObject({from:'2026-12-04',to:'2027-01-02'});
  expect(reportRange({range:'custom',from:'2026-01-01',to:'2028-01-01'},'2026-10-24').error).toBeTruthy();
  expect(reportRange({range:'custom',from:'2026-03-08',to:'2026-03-09'},'2026-10-24')).toMatchObject({from:'2026-03-08',to:'2026-03-09',error:undefined});
 });
});
