'use client';
import { useActionState,useState } from 'react';
import {createKey,revokeKey,type KeyState} from '@/app/settings/integrations/actions';
export function IntegrationKeys(){
 const [state,action,pending]=useActionState<KeyState,FormData>(createKey,{});
 const [hidden,setHidden]=useState(false);
 return <div>
 <form action={action} className="space-y-3" onSubmit={()=>setHidden(false)}>
 <label className="block">Key name<input name="name" required maxLength={80} placeholder="My AI assistant" className="mt-1 w-full rounded border px-3 py-2"/></label>
 <label className="block">Permission<select name="scope" className="ml-2 rounded border p-2"><option value="read">Read only</option><option value="write">Read and edit schedules</option></select></label>
 <label className="block">Expires in<select name="days" defaultValue="30" className="ml-2 rounded border p-2"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>
 <button disabled={pending} className="rounded bg-slate-900 px-4 py-2 text-white">{pending?'Creating…':'Create access key'}</button>
 </form>
 {state.error&&<p role="alert" className="mt-3 text-red-700">{state.error}</p>}
 {state.token&&!hidden&&<div role="status" className="mt-4 rounded border p-3"><p>Copy this key now. It is shown only here and cannot be retrieved later. Store it in your AI client’s authentication settings, never in chat messages.</p><code className="my-3 block break-all select-all">{state.token}</code><button className="rounded border px-3 py-1" onClick={()=>setHidden(true)}>Hide key</button></div>}
 </div>;
}
export function RevokeKey({id}:{id:string}){
 const [state,action,pending]=useActionState(async (_state:{error?:string},form:FormData)=>{const result=await revokeKey(form);return result.error?{error:result.error}:{};},{});
 return <form action={action}><input type="hidden" name="id" value={id}/><button disabled={pending} className="rounded border px-3 py-1">{pending?'Revoking…':'Revoke'}</button>{state.error&&<p role="alert">{state.error}</p>}</form>;
}
