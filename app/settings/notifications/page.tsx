import {WebNotifications} from '@/components/web-notifications';
import Link from 'next/link';
import {planningContext} from '@/lib/planning-data';
import {DisconnectDevice} from '@/components/push-devices';
export default async function Notifications({searchParams}:{searchParams:Promise<{error?:string}>}){
 const params=await searchParams;
 const {supabase,user,zone}=await planningContext();
 const {data,error}=await supabase.from('push_devices').select('id,name,platform,transport,lead_minutes,enabled,last_seen_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);
 return <main className="mx-auto max-w-2xl px-4 py-10 space-y-5"><Link prefetch={false} href="/settings" className="underline">Back to settings</Link><h1 className="text-3xl font-bold">Phone reminders</h1>
 <p>Install Focus Tracker from your browser on iPhone or Android, sign in with the same account, then enable notifications below. Permission is optional. No contacts or location permission is requested.</p>
 <p className="text-sm text-slate-600">Notifications use your account timezone ({zone}) and each phone’s reminder timing. All-day, completed, and trashed plans are excluded. The server checks the latest schedule, including changes made by AI. Delivery needs the configured notification service and an internet connection; phone settings can delay or suppress alerts.</p>
 <p className="text-sm text-slate-600">Titles and notes are hidden in push messages. Tap a reminder to open its plan after signing in. iPhone web push requires iOS/iPadOS 16.4+ and installation through Safari → Add to Home Screen. Android works with supported modern browsers. No developer account or app store is required.</p>
 {params.error==='disconnect'&&<p role="alert">Could not disconnect this device from reminders before signing out. Please try again online, or use Disable on this device below.</p>}
 <WebNotifications userId={user.id}/>
 {error&&<p role="alert">Phone reminders are unavailable. The administrator needs to apply the mobile push migration.</p>}
 {!error&&!data?.length&&<p>No phones registered yet.</p>}
 {data?.map(device=><section key={device.id} className="rounded border bg-white p-5 space-y-2"><h2 className="font-semibold">{device.name}</h2><p>{device.platform==='ios'?'iPhone / iPad':device.platform==='android'?'Android':'Web app'} · {device.enabled?'Enabled':'Disabled'} · {device.lead_minutes===0?'At start':`${device.lead_minutes} minutes before`}</p><p className="text-sm text-slate-600">Last active: {new Date(device.last_seen_at).toLocaleString('en-US',{timeZone:zone})}</p><DisconnectDevice id={device.id}/></section>)}
 </main>;
}
