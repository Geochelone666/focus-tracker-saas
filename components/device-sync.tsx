'use client';
import {useEffect,useRef} from 'react';
import {usePathname,useRouter} from 'next/navigation';
// Poll only visible, idle pages. No Realtime publication or private offline cache.
export function DeviceSync(){
 const router=useRouter(),path=usePathname(),last=useRef(0),editing=useRef(false);
 useEffect(()=>{
  editing.current=false;
  if(path==='/login'||path==='/')return;
  const markDirty=(event:Event)=>{if(event.target instanceof Element && event.target.closest('form'))editing.current=true;};
  const refresh=()=>{
   if(document.visibilityState!=='visible'||!navigator.onLine||editing.current||document.querySelector('button[disabled][type="submit"]'))return;
   const active=document.activeElement;
   if(active instanceof Element && active.closest('input,textarea,select,[contenteditable="true"]'))return;
   if(Date.now()-last.current<15000)return;
   last.current=Date.now();router.refresh();
  };
  const visibility=()=>refresh();
  const timer=setInterval(refresh,30000);
  document.addEventListener('input',markDirty);document.addEventListener('change',markDirty);
  window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',visibility);
  return()=>{clearInterval(timer);document.removeEventListener('input',markDirty);document.removeEventListener('change',markDirty);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',visibility);};
 },[router,path]);
 return null;
}
