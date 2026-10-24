import {validWebSubscription,type WebSubscription} from './web-push';
import { timingSafeEqual } from 'node:crypto';
import { createClient as supabaseClient } from '@supabase/supabase-js';
import { createClient as sessionClient } from '@/supabase/server';
import { getRequiredEnvVar } from './env';
export const LEAD_MINUTES=[0,5,10,15,30,60];
export type PushDevice={id:string;expo_token?:string;transport?:'expo'|'web';web_subscription?:WebSubscription;platform:'ios'|'android'|'web';name:string;lead_minutes:number};
export function validPushDevice(value:unknown):value is PushDevice{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const d=value as Record<string,unknown>;
 const transport=d.transport??'expo';
 const common=Object.keys(d).every(k=>['id','expo_token','transport','web_subscription','platform','name','lead_minutes'].includes(k))&&
 typeof d.id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(d.id)&&
 typeof d.name==='string'&&d.name.trim().length>0&&d.name.length<=80&&typeof d.lead_minutes==='number'&&LEAD_MINUTES.includes(d.lead_minutes);
 if(!common)return false;
 if(transport==='web')return d.platform==='web'&&d.expo_token===undefined&&validWebSubscription(d.web_subscription);
 return transport==='expo'&&d.web_subscription===undefined&&['ios','android'].includes(String(d.platform))&&typeof d.expo_token==='string'&&d.expo_token.length<=256&&/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(d.expo_token);
}
export function cronAuthorized(header:string|null,secret:string|undefined){
 if(!secret||secret.length<32||!header)return false;
 const actual=Buffer.from(header),expected=Buffer.from('Bearer '+secret);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export async function pushUser(request:Request){
 const auth=request.headers.get('authorization');
 if(auth){
  const token=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(auth)?.[1];if(!token||token.startsWith('ft_'))return null;
  const client=supabaseClient(getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_URL'),getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY'),{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(token);return !error&&data.user?{client,user:data.user}:null;
 }
 const client=await sessionClient();const {data,error}=await client.auth.getUser();return !error&&data.user?{client,user:data.user}:null;
}
export function pushAdmin(){return supabaseClient(getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_URL'),getRequiredEnvVar('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});}
