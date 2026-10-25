import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({context:vi.fn(),insert:vi.fn(),rpc:vi.fn(),update:vi.fn(),eq:vi.fn(),select:vi.fn(),maybeSingle:vi.fn(),upsert:vi.fn(),revalidate:vi.fn()}));
vi.mock('@/lib/planning-data',()=>({planningContext:mocks.context,refreshPlanningPaths:()=>['/today','/calendar','/review']}));
vi.mock('@/lib/planning',()=>import('../../lib/planning'));
vi.mock('@/lib/validation',()=>import('../../lib/validation'));
vi.mock('@/lib/calendar',()=>import('../../lib/calendar'));
vi.mock('next/cache',()=>({revalidatePath:mocks.revalidate}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw new Error('Redirect: '+url);}}));
import { changePlan, createPlan, editPlan, saveReflection, saveTimezone } from './actions';
const id='11111111-1111-4111-8111-111111111111';
function form(fields: Record<string,string>={}) {const data=new FormData();data.set('title','Read');data.set('expected_updated_at','2026-10-20T12:00:00.123456Z');for(const[k,v]of Object.entries(fields))data.set(k,v);return data;}
describe('planning actions',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.insert.mockResolvedValue({error:null});mocks.rpc.mockResolvedValue({data:1,error:null});mocks.upsert.mockResolvedValue({error:null});
    mocks.update.mockReturnValue({eq:mocks.eq});mocks.eq.mockReturnValue({eq:mocks.eq,select:mocks.select});
    mocks.select.mockReturnValue({maybeSingle:mocks.maybeSingle});mocks.maybeSingle.mockResolvedValue({data:{id},error:null});
    mocks.context.mockResolvedValue({user:{id:'owner'},today:'2026-10-20',supabase:{from:()=>({insert:mocks.insert,update:mocks.update,upsert:mocks.upsert}),rpc:mocks.rpc}});
  });
  it('creates a whole series in one atomic insert for the signed-in user',async()=>{
    const result=await createPlan({},form({scheduled_date:'2026-10-20',repeat:'weekly',occurrences:'3'}));
    expect(result.success).toContain('3');expect(mocks.insert).toHaveBeenCalledTimes(1);
    const rows=mocks.insert.mock.calls[0][0];
    expect(rows.map((r:{scheduled_date:string})=>r.scheduled_date)).toEqual(['2026-10-20','2026-10-27','2026-11-03']);
    expect(rows.every((r:{user_id:string;series_id:string})=>r.user_id==='owner'&&r.series_id===rows[0].series_id)).toBe(true);
  });
  it('returns a recoverable error without clearing input on failed saves',async()=>{
    mocks.insert.mockResolvedValue({error:{message:'denied'}});
    expect(await createPlan({},form())).toHaveProperty('error');expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('validates before authenticating or writing',async()=>{
    expect(await createPlan({},form({title:''}))).toHaveProperty('error');expect(mocks.context).not.toHaveBeenCalled();
  });
  it('uses the RLS-protected atomic editor for future occurrences',async()=>{
    expect(await editPlan(id,{},form({scheduled_date:'2026-10-21',scope:'future'}))).toHaveProperty('success');
    expect(mocks.rpc).toHaveBeenCalledWith('mutate_schedule',expect.objectContaining({p_id:id,p_expected:'2026-10-20T12:00:00.123456Z',p_patch:expect.objectContaining({scheduled_date:'2026-10-21'}),p_future:true}));
  });
  it('scopes moving to tomorrow to the signed-in owner and retains the reason',async()=>{
    await changePlan(id,'tomorrow',form({reason:'New priority'}));
    expect(mocks.rpc).toHaveBeenCalledWith('mutate_schedule',expect.objectContaining({p_id:id,p_expected:'2026-10-20T12:00:00.123456Z',p_patch:{scheduled_date:'2026-10-21',deferral_reason:'New priority'}}));
  });
  it('soft deletes and restores without destroying history',async()=>{
    await changePlan(id,'trash',form());expect(mocks.rpc).toHaveBeenCalledWith("mutate_schedule",expect.objectContaining({p_patch:{deleted_at:expect.any(String)}}));
    await changePlan(id,'restore',form());expect(mocks.rpc).toHaveBeenCalledWith("mutate_schedule",expect.objectContaining({p_patch:{deleted_at:null}}));
  });
  it('clears time when returning to the inbox',async()=>{await changePlan(id,'inbox',form());expect(mocks.rpc).toHaveBeenCalledWith("mutate_schedule",expect.objectContaining({p_patch:{scheduled_date:null,scheduled_time:null}}));});
  it('reports missing rows and rejects unsafe redirect destinations',async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code:"40001"}});
    await expect(changePlan(id,'complete',form({return_to:'https://evil.example'}))).rejects.toThrow('Redirect: /today?error=');
  });
  it('stores only the current user/day reflection',async()=>{
    expect(await saveReflection({},form({note:'Good progress'}))).toHaveProperty('success');
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({user_id:'owner',day:'2026-10-20',note:'Good progress'}));
  });
  it('validates timezone names before saving',async()=>{
    await expect(saveTimezone(form({timezone:'invalid/zone'}))).rejects.toThrow('Redirect: /settings?error=');expect(mocks.upsert).not.toHaveBeenCalled();
    await expect(saveTimezone(form({timezone:'Asia/Shanghai'}))).rejects.toThrow('Redirect: /settings?saved=1');
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({user_id:'owner',timezone:'Asia/Shanghai'}),{onConflict:'user_id'});
  });
});
