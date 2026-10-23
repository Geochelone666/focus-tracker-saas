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
});
