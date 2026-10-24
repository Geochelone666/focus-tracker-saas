'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
function identifier(){let id=localStorage.getItem('focus-push-device');if(!id){id=crypto.randomUUID();localStorage.setItem('focus-push-device',id);}return id;}
async function request(method:string,body?:unknown){const response=await fetch('/api/push/devices',{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error??'Could not connect. Try again.');return result;}
export function WebNotifications({userId}:{userId:string}){
 const router=useRouter();const [ready,setReady]=useState(false),[publicKey,setPublicKey]=useState(''),[supported,setSupported]=useState(false),[ios,setIos]=useState(false),[installed,setInstalled]=useState(false),[install,setInstall]=useState<InstallEvent|null>(null),[busy,setBusy]=useState(false),[enabled,setEnabled]=useState(false),[lead,setLead]=useState(10),[message,setMessage]=useState('');
 useEffect(()=>{
  const apple=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  setIos(apple);setInstalled(window.matchMedia('(display-mode: standalone)').matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone));
  const can='serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window&&window.isSecureContext;setSupported(can);
  const capture=(event:Event)=>{event.preventDefault();setInstall(event as InstallEvent);};window.addEventListener('beforeinstallprompt',capture);
  let alive=true;
  if(can){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>{if(alive){setSupported(false);setMessage('Could not prepare notifications. Reload and try again.');}});
   fetch('/api/push/config').then(r=>r.json()).then(config=>{if(alive){setReady(config.ready);setPublicKey(config.publicKey??'');}}).catch(()=>{});
   request('GET').then(result=>{if(!alive)return;const id=localStorage.getItem('focus-push-device'),device=result.data.find((d:{id:string;transport:string})=>d.id===id&&d.transport==='web');if(device){setEnabled(device.enabled&&Notification.permission==='granted');setLead(device.lead_minutes);}}).catch(()=>{});
  }
  return()=>{alive=false;window.removeEventListener('beforeinstallprompt',capture);};
 },[]);
 async function enable(){
  if(!ready){setMessage('The notification service is not configured yet. Contact the app administrator.');return;}
  setBusy(true);setMessage('');let subscription:PushSubscription|null=null,created=false;
  try{
   // Request directly from the tap, before awaiting network/SW work (required on iOS).
   const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Notifications were not allowed. Open your phone or browser settings to allow notifications, then try again.');
   const registration=await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Notification setup timed out. Reload and try again.')),15000))]);subscription=await registration.pushManager.getSubscription();
   if(!subscription){const bytes=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});created=true;}
   const id=identifier();await request('POST',{id,transport:'web',platform:'web',web_subscription:subscription.toJSON(),name:ios?'iPhone / iPad web app':'Installed web app',lead_minutes:lead});
   localStorage.setItem('focus-push-user',userId);document.cookie=`focus_push_device=${id}; Path=/; SameSite=Lax; Secure; Max-Age=31536000`;
   setEnabled(true);setMessage('Reminders enabled on this device. Use Send test notification to check delivery.');router.refresh();
  }catch(error){if(created&&subscription)await subscription.unsubscribe().catch(()=>{});setMessage(error instanceof Error?error.message:'Could not enable reminders.');}finally{setBusy(false);}
 }
 async function disable(){setBusy(true);setMessage('');try{await request('DELETE',{id:identifier()});const registration=await navigator.serviceWorker.getRegistration('/');await(await registration?.pushManager.getSubscription())?.unsubscribe();localStorage.removeItem('focus-push-user');document.cookie='focus_push_device=; Path=/; SameSite=Lax; Secure; Max-Age=0';setEnabled(false);setMessage('Reminders disabled on this device.');router.refresh();}catch(error){setMessage(error instanceof Error?error.message:'Could not disable reminders.');}finally{setBusy(false);}}
 async function test(){setBusy(true);setMessage('');try{const response=await fetch('/api/push/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:identifier()})});const result=await response.json();if(!response.ok)throw new Error(result.error);setMessage('Test accepted by the push service. Check your notifications; acceptance does not confirm delivery.');}catch(error){setMessage(error instanceof Error?error.message:'Test failed.');}finally{setBusy(false);}}
 return <section className="rounded border bg-white p-5 space-y-3"><h2 className="text-xl font-semibold">Install and enable reminders</h2>
 {ios&&!installed?<p>On iPhone or iPad (iOS/iPadOS 16.4+), open this site in Safari, tap Share → Add to Home Screen, then open the new Focus Tracker icon. Return here to enable notifications.</p>:!installed?<><p>On Android, use Chrome’s menu → Install app or Add to Home Screen. Then open the app icon and enable notifications here.</p>{install&&<button type="button" className="rounded bg-slate-900 px-4 py-2 text-white" onClick={()=>void install.prompt()}>Install Focus Tracker</button>}</>:<p>Opened as an installed app.</p>}
 {!supported?<p>Push notifications are not available in this browser context. On iPhone, install first; on Android, use an up-to-date Chrome browser.</p>:ios&&!installed?null:<>
 {!ready&&<p role="status">Notification service setup is pending. You can install the app and use your schedules now.</p>}
 <label className="block">Reminder timing<select value={lead} onChange={e=>setLead(Number(e.target.value))} className="ml-2 rounded border p-2">{[0,5,10,15,30,60].map(value=><option key={value} value={value}>{value===0?'At start':`${value} minutes before`}</option>)}</select></label>
 <div className="flex flex-wrap gap-3"><button type="button" disabled={busy||!ready} onClick={enable} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">{busy?'Please wait…':enabled?'Save reminder timing':'Enable notifications'}</button>{enabled&&<><button type="button" disabled={busy} onClick={test} className="rounded border px-3 py-2">Send test notification</button><button type="button" disabled={busy} onClick={disable} className="rounded border px-3 py-2">Disable on this device</button></>}</div>
 </>}
 {message&&<p role="status" className="text-sm">{message}</p>}
 </section>;
}
export function WebPushHeartbeat({userId}:{userId:string}){
 useEffect(()=>{let last=0;
 const refresh=async()=>{try{if(document.visibilityState!=='visible'||Date.now()-last<3600000||localStorage.getItem('focus-push-user')!==userId)return;last=Date.now();const id=localStorage.getItem('focus-push-device');if(!id)return;
 if('Notification'in window&&Notification.permission!=='granted'){await request('DELETE',{id});localStorage.removeItem('focus-push-user');return;}
 const result=await request('PATCH',{id});if(!result.enabled)localStorage.removeItem('focus-push-user');}catch{/* Retry on the next visible visit. */}};
 void refresh();const listener=()=>void refresh();window.addEventListener('focus',listener);document.addEventListener('visibilitychange',listener);const timer=setInterval(listener,3600000);
 return()=>{clearInterval(timer);window.removeEventListener('focus',listener);document.removeEventListener('visibilitychange',listener);};
 },[userId]);return null;
}
