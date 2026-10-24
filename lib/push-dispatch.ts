import {sendWebPush} from './web-push';
import type {SupabaseClient} from '@supabase/supabase-js';
export type PushJob={delivery_id:string;lease_id:string;expo_token:string|null;web_subscription?:unknown;schedule_id:string;scheduled_at:string};
type Ticket={status:'ok'|'error';id?:string;details?:{error?:string}};
const SEND='https://exp.host/--/api/v2/push/send',RECEIPTS='https://exp.host/--/api/v2/push/getReceipts';
function headers(){return {'Content-Type':'application/json',...(process.env.EXPO_ACCESS_TOKEN?{Authorization:'Bearer '+process.env.EXPO_ACCESS_TOKEN}:{})};}
export function pushMessage(job:PushJob){
 // Keep task titles/notes off lock screens and third-party push infrastructure.
 return {to:job.expo_token,title:'Focus Tracker',body:'A plan starts soon. Open the app to view it.',sound:'default',channelId:'schedule-reminders',ttl:300,data:{scheduleId:job.schedule_id}};
}
function safeCode(code:unknown){return typeof code==='string'&&/^[A-Za-z0-9_]{1,80}$/.test(code)?code:'UnknownError';}
function retryable(code:string){return ['MessageRateExceeded','UnknownError','NetworkError','ProviderUnavailable','Cancelled'].includes(code);}
async function settle(client:SupabaseClient,job:PushJob,ticket:Ticket|undefined){
 const ok=ticket?.status==='ok'&&typeof ticket.id==='string'&&ticket.id.length<=200;
 const code=safeCode(ticket?.details?.error);
 const patch=ok?{state:'ticketed',ticket_id:ticket.id,ticketed_at:new Date().toISOString(),token_sent:job.expo_token,error_code:null}:
 {state:retryable(code)?'retry':'failed',error_code:code,lease_until:new Date(Date.now()+60000).toISOString()};
 const {error}=await client.from('push_deliveries').update(patch).eq('id',job.delivery_id).eq('lease_id',job.lease_id).eq('state','sending');
 if(error)throw new Error('Could not persist push delivery status');
 if(code==='DeviceNotRegistered'&&job.expo_token)await client.from('push_devices').update({enabled:false}).eq('expo_token',job.expo_token);
 return Boolean(ok);
}
export async function sendReminders(client:SupabaseClient,fetcher:typeof fetch=fetch){
 const {data,error}=await client.rpc('claim_push_reminders',{p_limit:100});
 if(error)throw new Error('Could not claim reminder jobs');
 const jobs:PushJob[]=data??[],ready:PushJob[]=[];
 for(let start=0;start<jobs.length;start+=8)await Promise.all(jobs.slice(start,start+8).map(async job=>{
  const check=await client.rpc('check_push_delivery',{p_id:job.delivery_id,p_lease:job.lease_id});
  if(check.error)throw new Error('Could not check reminder state');
  if(check.data)ready.push(job);
  else await settle(client,job,{status:'error',details:{error:'Cancelled'}});
 }));
 let webAccepted=0;
 const webJobs=ready.filter(job=>job.web_subscription);
 for(let start=0;start<webJobs.length;start+=8)await Promise.all(webJobs.slice(start,start+8).map(async job=>{
  try{await sendWebPush(job.web_subscription,job.schedule_id);const update=await client.from('push_deliveries').update({state:'sent',error_code:null,receipt_checked_at:new Date().toISOString()}).eq('id',job.delivery_id).eq('lease_id',job.lease_id).eq('state','sending');if(update.error)throw new Error('Could not persist push');webAccepted++;}
  catch(error){const status=(error as {statusCode?:number}).statusCode;const gone=status===404||status===410;await settle(client,job,{status:'error',details:{error:gone?'SubscriptionGone':status===429?'ProviderUnavailable':'NetworkError'}});if(gone)await client.from('push_devices').update({enabled:false}).eq('web_subscription->>endpoint',(job.web_subscription as {endpoint:string}).endpoint);}
 }));
 const expoReady=ready.filter(job=>!job.web_subscription);
 if(!expoReady.length)return {claimed:jobs.length,accepted:webAccepted};
 let tickets:Ticket[];
 try{
  const response=await fetcher(SEND,{method:'POST',headers:headers(),body:JSON.stringify(expoReady.map(pushMessage)),signal:AbortSignal.timeout(15000)});
  if(!response.ok){const code=response.status===429||response.status>=500?'ProviderUnavailable':'ProviderRejected';tickets=expoReady.map(()=>({status:'error',details:{error:code}}));}
  else{const body=await response.json();tickets=Array.isArray(body.data)?body.data:[];}
 }catch{tickets=expoReady.map(()=>({status:'error',details:{error:'NetworkError'}}));}
 let accepted=webAccepted;
 for(let start=0;start<expoReady.length;start+=8)await Promise.all(expoReady.slice(start,start+8).map(async(job,index)=>{if(await settle(client,job,tickets[start+index]))accepted++;}));
 return {claimed:jobs.length,accepted};
}
export async function checkReceipts(client:SupabaseClient,fetcher:typeof fetch=fetch){
 const before=new Date(Date.now()-15*60000).toISOString(),expired=new Date(Date.now()-24*3600000).toISOString();
 const {error:expireError}=await client.from('push_deliveries').update({state:'failed',error_code:'ReceiptExpired'}).eq('state','ticketed').lt('ticketed_at',expired);
 if(expireError)throw new Error('Could not expire old tickets');
 const {data,error}=await client.from('push_deliveries').select('id,device_id,ticket_id,token_sent').eq('state','ticketed').lte('ticketed_at',before).order('ticketed_at').limit(100);
 if(error)throw new Error('Could not read push tickets');
 if(!data?.length)return 0;
 const response=await fetcher(RECEIPTS,{method:'POST',headers:headers(),body:JSON.stringify({ids:data.map(x=>x.ticket_id)}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Push receipt provider unavailable');
 const body=await response.json();let checked=0;
 for(const row of data){
  const receipt=body.data?.[row.ticket_id] as Ticket|undefined;if(!receipt)continue;
  const code=receipt.status==='ok'?null:safeCode(receipt.details?.error);
  const {error:updateError}=await client.from('push_deliveries').update({state:receipt.status==='ok'?'sent':'failed',error_code:code,receipt_checked_at:new Date().toISOString()}).eq('id',row.id).eq('state','ticketed');
  if(updateError)throw new Error('Could not save push receipt');
  if(code==='DeviceNotRegistered'&&typeof row.token_sent==='string')await client.from('push_devices').update({enabled:false}).eq('id',row.device_id).eq('expo_token',row.token_sent);
  checked++;
 }
 return checked;
}
export async function testPush(token:string,fetcher:typeof fetch=fetch){
 const response=await fetcher(SEND,{method:'POST',headers:headers(),body:JSON.stringify([{to:token,title:'Focus Tracker',body:'Your test reminder is ready.',sound:'default',channelId:'schedule-reminders',ttl:300}]),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Push provider unavailable. Please try again later.');
 const body=await response.json();if(body.data?.[0]?.status!=='ok')throw new Error('Push provider rejected the test: '+safeCode(body.data?.[0]?.details?.error));
}
