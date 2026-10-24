'use client';
import {useState} from 'react';
export function DisconnectDevice({id}:{id:string}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[done,setDone]=useState(false);
 async function disconnect(){
  setBusy(true);setMessage('');
  try{const response=await fetch('/api/push/devices',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});if(!response.ok)throw new Error();setDone(true);setMessage('Disconnected. This phone must opt in again before receiving reminders.');}
  catch{setMessage('Could not disconnect. Please try again online.');}finally{setBusy(false);}
 }
 return <div><button type="button" disabled={busy||done} onClick={disconnect} className="rounded border px-3 py-2 disabled:opacity-50">{busy?'Disconnecting…':done?'Disconnected':'Disconnect phone'}</button>{message&&<p role="status" className="mt-2 text-sm">{message}</p>}</div>;
}
