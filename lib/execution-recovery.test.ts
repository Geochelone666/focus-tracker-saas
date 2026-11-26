import {expect,it} from 'vitest';
import {recoveryStatus,type RecoveryTask} from './execution-recovery';
const task:RecoveryTask={id:'a',title:'Work',updated_at:'2026-11-05T00:00Z',scheduled_date:'2026-11-01',scheduled_time:'01:30:00',estimated_minutes:60,remaining_minutes:null,resume_note:null,notes:null,skill_id:null,actual_seconds:null,latest_session:null,active_status:null};
it('keeps unknown actual time distinct from zero and never infers completion',()=>{
 expect(recoveryStatus(task,'America/Toronto',Date.parse('2026-11-01T07:31Z')).kind).toBe('unfinished_block');
 expect(recoveryStatus({...task,actual_seconds:5400},'UTC',0).kind).toBe('over_estimate');
 expect(recoveryStatus({...task,active_status:'paused',actual_seconds:5400},'UTC',0).kind).toBe('active');
});
it('uses the later repeated hour and elapsed duration across DST',()=>{
 expect(recoveryStatus(task,'America/Toronto',Date.parse('2026-11-01T06:45Z')).kind).toBe('open');
 expect(recoveryStatus({...task,scheduled_date:'2027-03-14'},'America/Toronto',Date.parse('2027-03-14T07:31Z')).kind).toBe('unfinished_block');
});
it('does not invent an end for date-only or unestimated tasks',()=>{
 expect(recoveryStatus({...task,scheduled_time:null},'UTC',Date.now()).kind).toBe('open');
 expect(recoveryStatus({...task,estimated_minutes:null},'UTC',Date.now()).kind).toBe('open');
});
