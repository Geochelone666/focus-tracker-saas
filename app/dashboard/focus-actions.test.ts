import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(()=>({createClient:vi.fn(), rpc:vi.fn(), revalidatePath:vi.fn()}));
vi.mock('@/supabase/server',()=>({createClient:mocks.createClient}));
vi.mock('@/lib/validation',()=>import('../../lib/validation'));
vi.mock('next/cache',()=>({revalidatePath:mocks.revalidatePath}));
import { transitionFocus } from './focus-actions';
const id='11111111-1111-4111-8111-111111111111';
const form=()=>{const f=new FormData();f.set('session_id',id);f.set('focus_revision','2');f.set('focus_action','pause');return f;};
beforeEach(()=>{vi.clearAllMocks();mocks.rpc.mockResolvedValue({data:{},error:null});mocks.createClient.mockResolvedValue({auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},rpc:mocks.rpc});});
describe('focus transitions',()=>{
  it('requires authentication',async()=>{
    mocks.createClient.mockResolvedValue({auth:{getUser:async()=>({data:{user:null},error:null})},rpc:mocks.rpc});
    expect((await transitionFocus({},form())).error).toMatch(/sign in/);expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(['pause','resume','complete','abandon'])('sends %s with the exact revision to the owner-scoped atomic RPC',async action=>{
    const f=form();f.set('focus_action',action);f.set('note','  outcome  ');
    expect(await transitionFocus({},f)).toEqual({saved:true});
    expect(mocks.rpc).toHaveBeenCalledWith('transition_focus',{p_id:id,p_revision:2,p_action:action,p_note:'outcome',p_skill:null});
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/today');
  });
  it('reports a concurrent-device conflict without retrying stale intent',async()=>{
    mocks.rpc.mockResolvedValue({error:{code:'40001'}});
    expect((await transitionFocus({},form())).error).toMatch(/another device/);expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
  it.each(['-1','2.2','2147483648',''])('rejects invalid revisions %j',async revision=>{
    const f=form();f.set('focus_revision',revision);expect((await transitionFocus({},f)).error).toBeTruthy();expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('keeps the form recoverable on network errors',async()=>{
    mocks.rpc.mockRejectedValue(new Error('offline'));expect((await transitionFocus({},form())).error).toMatch(/kept/);
  });
});
