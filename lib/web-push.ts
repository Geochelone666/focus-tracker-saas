import webpush from 'web-push';
export type WebSubscription={endpoint:string;keys:{p256dh:string;auth:string}};
export function validWebSubscription(value:unknown):value is WebSubscription{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const s=value as WebSubscription;
 if(typeof s.endpoint!=='string'||s.endpoint.length>2048||typeof s.keys?.p256dh!=='string'||typeof s.keys?.auth!=='string')return false;
 try{const u=new URL(s.endpoint);const host=u.hostname;
 if(u.protocol!=='https:'||u.username||u.password||u.hash||(u.port&&u.port!=='443'))return false;
 if(!(host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.apple.com')||host.endsWith('.notify.windows.com')))return false;
 }catch{return false;}
 return /^[A-Za-z0-9_-]{87}$/.test(s.keys.p256dh)&&/^[A-Za-z0-9_-]{22}$/.test(s.keys.auth);
}
export function webPushReady(){return /^[A-Za-z0-9_-]{87}$/.test(process.env.WEB_PUSH_PUBLIC_KEY??'')&&Boolean(process.env.WEB_PUSH_PRIVATE_KEY)&&/^(mailto:|https:\/\/)/.test(process.env.WEB_PUSH_SUBJECT??'');}
export async function sendWebPush(subscription:unknown,scheduleId?:string){
 if(!validWebSubscription(subscription))throw Object.assign(new Error('Invalid subscription'),{statusCode:410});
 if(!webPushReady())throw new Error('Web push is not configured');
 return webpush.sendNotification(subscription,JSON.stringify({title:'Focus Tracker',body:scheduleId?'A plan starts soon. Open the app to view it.':'Your test reminder is ready.',...(scheduleId?{scheduleId}:{})}),{TTL:300,urgency:'high',timeout:15000,vapidDetails:{subject:process.env.WEB_PUSH_SUBJECT!,publicKey:process.env.WEB_PUSH_PUBLIC_KEY!,privateKey:process.env.WEB_PUSH_PRIVATE_KEY!}});
}
