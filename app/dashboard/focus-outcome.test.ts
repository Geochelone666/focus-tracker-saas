import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({
 createClient:vi.fn(),revalidatePath:vi.fn(),
 update:vi.fn(),eq:vi.fn(),not:vi.fn(),select:vi.fn(),maybeSingle:vi.fn(),from:vi.fn()
}));
vi.mock('@/supabase/server',()=>({createClient:mocks.createClient}));
vi.mock('next/cache',()=>({revalidatePath:mocks.revalidatePath}));
import {saveCompletedFocusOutcome} from './focus-actions';
const id='11111111-1111-4111-8111-111111111111';
function form(){
 const f=new FormData();f.set('session_id',id);f.set('focus_revision','4');
 f.set('note','  Work finished  ');f.set('skill_id','22222222-2222-4222-8222-222222222222');
 return f;
}
beforeEach(()=>{
 vi.clearAllMocks();
 mocks.from.mockReturnValue(mocks);
 for(const name of ['update','eq','not','select'] as const)mocks[name].mockReturnValue(mocks);
 mocks.maybeSingle.mockResolvedValue({data:{id},error:null});
 mocks.createClient.mockResolvedValue({
  auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},
  from:mocks.from
 });
});
describe('completed focus outcome editing',()=>{
 it('saves only note and owned skill on a completed revision',async()=>{
  expect(await saveCompletedFocusOutcome({},form())).toEqual({saved:true});
  expect(mocks.from).toHaveBeenCalledWith('focus_sessions');
  expect(mocks.update).toHaveBeenCalledWith({note:'Work finished',skill_id:'22222222-2222-4222-8222-222222222222'});
  expect(mocks.eq).toHaveBeenCalledWith('user_id','owner');
  expect(mocks.eq).toHaveBeenCalledWith('focus_status','completed');
  expect(mocks.eq).toHaveBeenCalledWith('focus_revision',4);
  expect(mocks.not).toHaveBeenCalledWith('ended_at','is',null);
  expect(mocks.revalidatePath).toHaveBeenCalledWith('/review');
 });
 it('supports clearing the note and skill without changing time',async()=>{
  const f=form();f.set('note','  ');f.set('skill_id','');
  expect(await saveCompletedFocusOutcome({},f)).toEqual({saved:true});
  expect(mocks.update).toHaveBeenCalledWith({note:null,skill_id:null});
 });
 it('refuses an outdated version without overwriting another device',async()=>{
  mocks.maybeSingle.mockResolvedValue({data:null,error:null});
  expect((await saveCompletedFocusOutcome({},form())).error).toMatch(/another device/);
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
 });
 it('rejects anonymous outcome changes',async()=>{
  mocks.createClient.mockResolvedValue({auth:{getUser:async()=>({data:{user:null},error:null})}});
  expect((await saveCompletedFocusOutcome({},form())).error).toMatch(/sign in/);
  expect(mocks.from).not.toHaveBeenCalled();
 });
 it.each(['-1','1.5','2147483648',''])('rejects invalid revision %s',async revision=>{
  const f=form();f.set('focus_revision',revision);
  expect((await saveCompletedFocusOutcome({},f)).error).toBeTruthy();
  expect(mocks.from).not.toHaveBeenCalled();
 });
 it('preserves form input after a network failure',async()=>{
  mocks.maybeSingle.mockRejectedValue(new Error('offline'));
  expect((await saveCompletedFocusOutcome({},form())).error).toMatch(/still in this form/);
 });
});
