import {sameOrigin} from '@/lib/request-origin';
import {sendWebPush} from '@/lib/web-push';
import {pushUser} from '@/lib/push';
import {testPush} from '@/lib/push-dispatch';
import {json,readBody} from '@/lib/integration-api';
import {validateId} from '@/lib/validation';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){
 if(!sameOrigin(request))return json({error:'Origin not allowed'},403);
 try{
  const context=await pushUser(request);if(!context)return json({error:'Please log in'},401);
  const body=await readBody(request) as {id?:unknown};let id;try{id=validateId(body?.id);}catch{return json({error:'Invalid phone'},400);}
  const before=new Date(Date.now()-60000).toISOString();
  const {data,error}=await context.client.from('push_devices').update({last_test_at:new Date().toISOString()}).eq('id',id).eq('user_id',context.user.id).eq('enabled',true).or(`last_test_at.is.null,last_test_at.lte.${before}`).select('expo_token,web_subscription').maybeSingle();
  if(error)return json({error:'Phone notification service unavailable'},503);
  if(!data)return json({error:'Enable this phone first, or wait one minute before another test.'},429);
  try{if(data.web_subscription)await sendWebPush(data.web_subscription);else await testPush(data.expo_token!);return json({accepted:true});}catch(error){return json({error:error instanceof Error?error.message:'Test unavailable'},503);}
 }catch{return json({error:'Invalid request or unavailable phone service'},400);}
}
