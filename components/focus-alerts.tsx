'use client';
import { useEffect, useRef, useState } from 'react';
/** Audio contexts are activated only by this session's explicit user gesture. */
export function FocusAlerts({ expired, identity }: { expired: boolean; identity: string }) {
  const [sound,setSound]=useState(false),[notify,setNotify]=useState(false),[message,setMessage]=useState('');
  const context=useRef<AudioContext | null>(null), notified=useRef('');
  useEffect(()=>()=>{void context.current?.close();},[]);
  useEffect(()=>{
    if(!expired || notified.current===identity)return;
    notified.current=identity;
    if(notify && 'Notification' in window && Notification.permission==='granted')new Notification('Focus Tracker',{body:'This phase is complete. Take a moment to review your progress.'});
    if(sound && context.current?.state==='running') {
      const oscillator=context.current.createOscillator(),gain=context.current.createGain();
      oscillator.connect(gain);gain.connect(context.current.destination);gain.gain.value=.08;
      oscillator.frequency.value=660;oscillator.start();oscillator.stop(context.current.currentTime+.3);
    }
  },[expired,identity,notify,sound]);
  return <fieldset className="my-3 flex flex-wrap gap-3 text-sm"><legend className="sr-only">Optional completion alerts</legend>
    <label><input type="checkbox" checked={sound} onChange={async event=>{
      const enabled=event.target.checked;
      if(enabled){try{context.current??=new AudioContext();await context.current.resume();}catch{setMessage('Sound is unavailable in this browser.');return;}}
      setSound(enabled);
    }} /> Sound for this session</label>
    <label><input type="checkbox" checked={notify} onChange={async event=>{
      if(!event.target.checked){setNotify(false);return;}
      if(!('Notification' in window)){setMessage('Notifications are unavailable in this browser.');return;}
      try{const permission=await Notification.requestPermission();setNotify(permission==='granted');if(permission!=='granted')setMessage('Notifications remain off.');}catch{setMessage('Notifications remain off.');}
    }} /> Notify when complete</label>
    {message && <p role="status" className="w-full">{message}</p>}
  </fieldset>;
}
