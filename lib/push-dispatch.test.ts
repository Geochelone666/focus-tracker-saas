import {beforeEach,describe,it,expect,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
vi.mock('./web-push',()=>({sendWebPush:vi.fn().mockResolvedValue(undefined)}));
import {sendWebPush} from './web-push';
import {sendReminders,checkReceipts,pushMessage,type PushJob} from './push-dispatch';
const job:PushJob={delivery_id:'delivery',lease_id:'lease',expo_token:'ExpoPushToken[device]',schedule_id:'schedule',scheduled_at:'2026-10-23T16:10:00Z'};
function mockClient(){
 const changes:unknown[]=[],chain:Record<string,ReturnType<typeof vi.fn>>={};
 for(const method of ['eq','lt','lte','order','limit'])chain[method]=vi.fn(()=>chain);
 chain.then=vi.fn(resolve=>Promise.resolve({data:[],error:null}).then(resolve));
 const update=vi.fn(patch=>{changes.push(patch);return chain;});
 const rpc=vi.fn(async(name:string)=>name==='claim_push_reminders'?{data:[job],error:null}:{data:true,error:null});
 return {client:{rpc,from:vi.fn(()=>({update,select:vi.fn(()=>chain)}))} as unknown as SupabaseClient,rpc,changes,chain};
}
beforeEach(()=>{vi.unstubAllEnvs();vi.mocked(sendWebPush).mockReset().mockResolvedValue({statusCode:201,body:'',headers:{}});});
describe('push delivery and receipts',()=>{
 it('sends browser reminders without Expo accounts or HTTP calls to Expo',async()=>{const mock=mockClient(),web={...job,expo_token:null,web_subscription:{endpoint:'https://web.push.apple.com/test'}};mock.rpc.mockImplementation(async(name:string)=>name==='claim_push_reminders'?{data:[web] as unknown as PushJob[],error:null}:{data:true,error:null});const fetcher=vi.fn();const result=await sendReminders(mock.client,fetcher);expect(result.accepted).toBe(1);expect(sendWebPush).toHaveBeenCalledWith(web.web_subscription,'schedule');expect(fetcher).not.toHaveBeenCalled();expect(mock.changes[0]).toMatchObject({state:'sent'});});
 it('disables expired browser subscriptions',async()=>{const mock=mockClient(),web={...job,expo_token:null,web_subscription:{endpoint:'https://web.push.apple.com/test'}};mock.rpc.mockImplementation(async(name:string)=>name==='claim_push_reminders'?{data:[web] as unknown as PushJob[],error:null}:{data:true,error:null});vi.mocked(sendWebPush).mockRejectedValue({statusCode:410});await sendReminders(mock.client,vi.fn());expect(mock.changes).toContainEqual({enabled:false});});
 it('keeps task text out of push payloads',()=>{const message=pushMessage(job);expect(message).toMatchObject({to:job.expo_token,data:{scheduleId:'schedule'},ttl:300});expect(message.body).not.toContain('title');});
 it('records ticket acceptance separately from delivery',async()=>{const mock=mockClient(),fetcher=vi.fn().mockResolvedValue(Response.json({data:[{status:'ok',id:'ticket'}]}));const result=await sendReminders(mock.client,fetcher);expect(result.accepted).toBe(1);expect(mock.changes[0]).toMatchObject({state:'ticketed',ticket_id:'ticket'});expect(mock.changes[0]).not.toMatchObject({state:'sent'});});
 it('re-checks schedules before sending and skips completed/rescheduled jobs',async()=>{const mock=mockClient();mock.rpc.mockImplementation(async(name:string)=>name==='claim_push_reminders'?{data:[job],error:null}:{data:false,error:null});const fetcher=vi.fn();await sendReminders(mock.client,fetcher);expect(fetcher).not.toHaveBeenCalled();expect(mock.changes[0]).toMatchObject({state:'retry',error_code:'Cancelled'});});
 it('retries provider throttling with a bounded database lease',async()=>{const mock=mockClient();await sendReminders(mock.client,vi.fn().mockResolvedValue(new Response('',{status:429})));expect(mock.changes[0]).toMatchObject({state:'retry',error_code:'ProviderUnavailable'});});
 it('handles uncertain network failures as retries',async()=>{const mock=mockClient();await sendReminders(mock.client,vi.fn().mockRejectedValue(new Error('network')));expect(mock.changes[0]).toMatchObject({state:'retry',error_code:'NetworkError'});});
 it('disables unregistered tokens',async()=>{const mock=mockClient();await sendReminders(mock.client,vi.fn().mockResolvedValue(Response.json({data:[{status:'error',details:{error:'DeviceNotRegistered'}}]})));expect(mock.changes).toContainEqual({enabled:false});expect(mock.changes[0]).toMatchObject({state:'failed'});});
 it('does not silently lose persistence failures',async()=>{const mock=mockClient();mock.chain.then=vi.fn(resolve=>Promise.resolve({error:{message:'failed'}}).then(resolve));await expect(sendReminders(mock.client,vi.fn().mockResolvedValue(Response.json({data:[{status:'ok',id:'ticket'}]})))).rejects.toThrow('persist');});
 it('checks receipts only for older tickets and separates provider delivery',async()=>{const mock=mockClient();let query=0;mock.chain.then=vi.fn(resolve=>Promise.resolve(++query===1?{error:null}:{data:[{id:'delivery',device_id:'phone',ticket_id:'ticket'}],error:null}).then(resolve));const fetcher=vi.fn().mockResolvedValue(Response.json({data:{ticket:{status:'ok'}}}));expect(await checkReceipts(mock.client,fetcher)).toBe(1);expect(mock.changes[1]).toMatchObject({state:'sent',error_code:null});});
});
