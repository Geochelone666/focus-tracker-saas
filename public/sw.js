/* Only notifications: no private pages, API responses or task data are cached. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
 let data={};try{data=event.data?.json()??{};}catch{}
 const id=typeof data.scheduleId==='string'&&/^[a-f0-9-]{36}$/i.test(data.scheduleId)?data.scheduleId:null;
 event.waitUntil(self.registration.showNotification('Focus Tracker',{
  body:id?'A plan starts soon. Open the app to view it.':'Your test reminder is ready.',
  icon:'/icons/icon-192.png',badge:'/icons/badge-96.png',tag:id?'plan:'+id:'focus-test',
  data:{path:id?'/plans/'+id:'/today'}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const path=event.notification.data?.path;
 const safePath=typeof path==='string'&&/^\/plans\/[a-f0-9-]{36}$/i.test(path)?path:'/today';
 const url=new URL(safePath,self.location.origin).href;
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows)if(new URL(client.url).origin===self.location.origin){await client.navigate(url);return client.focus();}
  return self.clients.openWindow(url);
 })());
});
