import { beforeEach,expect,it,vi } from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn(),getUser:vi.fn()}));
vi.mock('@/supabase/server',()=>({createClient:async()=>({rpc:mock.rpc,auth:{getUser:mock.getUser}})}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/smart-scheduler/live-preview',()=>import('../../../lib/smart-scheduler/live-preview'));
vi.mock('@/lib/validation',()=>import('../../../lib/validation'));
vi.mock('@/lib/wall-time',()=>import('../../../lib/wall-time'));
vi.mock('@/lib/calendar',()=>import('../../../lib/calendar'));
import { generateCalendarPreview,stageCalendarSelection,confirmCalendarSelection,undoCalendarSelection,setCalendarTaskLock } from './actions';
const id='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('FOCUS_SMART_CALENDAR_ENABLED','true');mock.getUser.mockResolvedValue({data:{user:{id}},error:null});});
it('gates all actions when the feature is disabled',async()=>{
  vi.stubEnv('FOCUS_SMART_CALENDAR_ENABLED','false');
  expect(await generateCalendarPreview({date:'2027-06-15',days:1,start:'09:00',end:'17:00'})).toHaveProperty('error');
  expect(await confirmCalendarSelection(id,id)).toHaveProperty('error');
  expect(await undoCalendarSelection(id,id)).toHaveProperty('error');
  expect(await setCalendarTaskLock(id,'2026-11-05T00:00:00Z',null,true)).toHaveProperty('error');
  expect(mock.rpc).not.toHaveBeenCalled();
});
it('requires authenticated identity before any RPC',async()=>{
  mock.getUser.mockResolvedValue({data:{user:null},error:null});
  expect(await confirmCalendarSelection(id,id)).toHaveProperty('error');
  expect(mock.rpc).not.toHaveBeenCalled();
});
it('binds account-local manual edits and exact revision to guarded staging',async()=>{
  mock.rpc.mockResolvedValue({data:id,error:null});
  expect(await stageCalendarSelection({timezone:'America/Toronto',revision:'9007199254740993',
    availability:[{start_at:'2027-06-15T13:00:00Z',end_at:'2027-06-15T21:00:00Z'}],
    changes:[{id,expected_updated_at:'2026-11-04T12:00:00.123456Z',date:'2027-06-15',time:'14:00',minutes:90}]})).toEqual({draftId:id});
  expect(mock.rpc).toHaveBeenCalledWith('stage_calendar_preview',expect.objectContaining({p_timezone:'America/Toronto',p_base_revision:'9007199254740993',p_changes:[{id,expected_updated_at:'2026-11-04T12:00:00.123456Z',start_at:'2027-06-15T18:00:00Z',end_at:'2027-06-15T19:30:00Z'}]}));
});
it('passes the same request identity on retry and surfaces CAS conflicts',async()=>{
  mock.rpc.mockResolvedValue({data:null,error:{code:'40001',message:'private SQL detail'}});
  const result=await confirmCalendarSelection(id,id);
  await confirmCalendarSelection(id,id);
  expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1]);
  expect(result.error).toMatch(/fresh preview/);
  expect(result.error).not.toContain('private');
});

it('uses explicit target lock state and exact task/lock versions',async()=>{
  mock.rpc.mockResolvedValue({data:{locked:false,lock_version:null},error:null});
  const taskStamp='2026-11-05T12:00:00.123456Z',lockStamp='2026-11-05T12:01:00.654321Z';
  expect(await setCalendarTaskLock(id,taskStamp,lockStamp,false)).toEqual({locked:false,lockVersion:null});
  expect(mock.rpc).toHaveBeenCalledWith('set_calendar_task_lock',{p_id:id,p_expected:taskStamp,p_expected_lock:lockStamp,p_locked:false});
});
