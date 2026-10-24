import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({admin:vi.fn(),send:vi.fn(),receipts:vi.fn()}));
vi.mock('@/lib/push',async()=>({cronAuthorized:(header:string|null,secret:string|undefined)=>Boolean(secret&&secret.length>=32&&header==='Bearer '+secret),pushAdmin:m.admin}));
vi.mock('@/lib/push-dispatch',()=>({sendReminders:m.send,checkReceipts:m.receipts}));
vi.mock('@/lib/integration-api',()=>({json:(body:unknown,status=200)=>Response.json(body,{status})}));
import {POST} from './route';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('CRON_SECRET','a'.repeat(40));m.admin.mockReturnValue({rpc:vi.fn().mockResolvedValue({error:null})});m.send.mockResolvedValue({claimed:1,accepted:1});m.receipts.mockResolvedValue(0);});
describe('private reminder scheduler',()=>{
 it('never invokes privileged work without the scheduler secret',async()=>{expect((await POST(new Request('https://example.test',{method:'POST'}))).status).toBe(401);expect(m.admin).not.toHaveBeenCalled();});
 it('sends jobs only for an authorized invocation',async()=>{expect((await POST(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer '+'a'.repeat(40)}}))).status).toBe(200);expect(m.send).toHaveBeenCalledOnce();});
 it('records a safe failure category without leaking internal errors',async()=>{
  const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
  try{m.send.mockRejectedValue(new Error('secret error details should not be logged'));
   const result=await POST(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer '+'a'.repeat(40)}}));
   expect(result.status).toBe(503);
   expect(spy).toHaveBeenCalledWith('push-dispatch-failed',{kind:'Error'});
   expect(JSON.stringify(spy.mock.calls)).not.toContain('secret error details');
  }finally{spy.mockRestore();}
 });
 it('exposes receipt-check failure in aggregate status without losing successful sends',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),info=vi.spyOn(console,'info').mockImplementation(()=>{});
  try{m.receipts.mockRejectedValue(new Error('secret receipt details'));
   const response=await POST(new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer '+'a'.repeat(40)}}));
   expect(response.status).toBe(200);
   expect(await response.json()).toMatchObject({claimed:1,accepted:1,receiptCheckFailed:true,cleanupFailed:false});
   expect(warn).toHaveBeenCalledWith('push-receipts-failed',{kind:'Error'});
   expect(JSON.stringify(warn.mock.calls)).not.toContain('secret receipt details');
  }finally{warn.mockRestore();info.mockRestore();}
 });
});
