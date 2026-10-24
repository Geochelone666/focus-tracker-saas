import {sameOrigin} from '@/lib/request-origin';
import {webPushReady} from '@/lib/web-push';
import {pushUser,validPushDevice} from '@/lib/push';
import {json,readBody} from '@/lib/integration-api';
import {validateId} from '@/lib/validation';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{const context=await pushUser(request);if(!context)return json({error:'Please log in'},401);
 const {data,error}=await context.client.from('push_devices').select('id,name,platform,transport,lead_minutes,enabled,last_seen_at').eq('user_id',context.user.id).order('created_at',{ascending:false}).limit(100);
 return error?json({error:'Could not load devices. Check the mobile push migration.'},503):json({data});
 }catch{return json({error:'Device service unavailable'},503);}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return json({error:'Origin not allowed'},403);
 try{const context=await pushUser(request);if(!context)return json({error:'Please log in'},401);
 const body=await readBody(request);if(!validPushDevice(body))return json({error:'Invalid device details'},400);
 if(body.transport==='web'&&!webPushReady())return json({error:'Web notifications are not configured yet. Please contact the app administrator.'},503);
 const {error}=await context.client.from('push_devices').upsert({expo_token:null,web_subscription:null,...body,name:body.name.trim(),user_id:context.user.id,enabled:true,last_seen_at:new Date().toISOString()},{onConflict:'id'});
 return error?json({error:'Could not enable this phone. Revoke its previous account registration first, then try again.'},409):json({success:true});
 }catch{return json({error:'Invalid request or unavailable device service'},400);}
}
export async function DELETE(request:Request){
 if(!sameOrigin(request))return json({error:'Origin not allowed'},403);
 try{const context=await pushUser(request);if(!context)return json({error:'Please log in'},401);
 const body=await readBody(request) as {id?:unknown};const id=validateId(body?.id);
 const {error}=await context.client.from('push_devices').delete().eq('id',id).eq('user_id',context.user.id);
 return error?json({error:'Could not disable notifications. Try again online.'},503):json({success:true});
 }catch{return json({error:'Invalid request'},400);}
}
export async function PATCH(request:Request){
 if(!sameOrigin(request))return json({error:'Origin not allowed'},403);
 try{const context=await pushUser(request);if(!context)return json({error:'Please log in'},401);
 const body=await readBody(request) as {id?:unknown;expo_token?:unknown};const id=validateId(body?.id);
 if(body.expo_token!==undefined&&(typeof body.expo_token!=='string'||body.expo_token.length>256||!/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(body.expo_token)))return json({error:'Invalid push token'},400);
 const {data,error}=await context.client.from('push_devices').update({last_seen_at:new Date().toISOString(),...(body.expo_token?{expo_token:body.expo_token}:{})}).eq('id',id).eq('user_id',context.user.id).eq('enabled',true).select('id');
 return error?json({error:'Could not update this phone'},409):json({enabled:Boolean(data?.length)});
 }catch{return json({error:'Invalid request or unavailable device service'},400);}
}
