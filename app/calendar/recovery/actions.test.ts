import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),user:vi.fn()}));
vi.mock('@/supabase/server',()=>({createClient:async()=>({rpc:mocks.rpc,auth:{getUser:mocks.user}})}));
vi.mock('@/lib/validation',()=>import('../../../lib/validation'));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {saveRecoveryContext} from './actions';
const id='a6000000-0000-4000-8000-000000000003';
const form=()=>{const f=new FormData();for(const [k,v] of Object.entries({id,expected_updated_at:'2026-11-05T12:00:00.123456Z',remaining_minutes:'30',resume_note:'Run the next check'}))f.set(k,v);return f;};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('FOCUS_EXECUTION_RECOVERY_ENABLED','true');mocks.user.mockResolvedValue({data:{user:{id:'owner'}},error:null});});
it('gates recovery writes and requires authentication',async()=>{
 vi.stubEnv('FOCUS_EXECUTION_RECOVERY_ENABLED','false');expect(await saveRecoveryContext({},form())).toHaveProperty('error');expect(mocks.rpc).not.toHaveBeenCalled();
 vi.stubEnv('FOCUS_EXECUTION_RECOVERY_ENABLED','true');mocks.user.mockResolvedValue({data:{user:null},error:null});expect(await saveRecoveryContext({},form())).toHaveProperty('error');expect(mocks.rpc).not.toHaveBeenCalled();
});
it('writes only the manual remaining estimate and note with the original exact revision',async()=>{
 mocks.rpc.mockResolvedValue({data:'2026-11-05T12:00:01.123456Z',error:null});
 expect(await saveRecoveryContext({},form())).toHaveProperty('revision');
 expect(mocks.rpc).toHaveBeenCalledWith('save_task_recovery',{p_id:id,p_expected:'2026-11-05T12:00:00.123456Z',p_remaining:30,p_note:'Run the next check'});
});
it('preserves unknown estimates and exposes conflicts without SQL details',async()=>{
 const f=form();f.set('remaining_minutes','');mocks.rpc.mockResolvedValue({data:null,error:{code:'40001',message:'private database'}});
 const result=await saveRecoveryContext({},f);expect(mocks.rpc.mock.calls[0][1].p_remaining).toBeNull();expect(result.error).toMatch(/changed on another device/);expect(result.error).not.toContain('private');
});
