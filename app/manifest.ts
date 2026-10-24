import type {MetadataRoute} from 'next';
export default function manifest():MetadataRoute.Manifest{
 return {id:'/',name:'Focus Tracker',short_name:'Focus',description:'Plan your day and make room for focused work.',start_url:'/today',scope:'/',display:'standalone',background_color:'#f8fafc',theme_color:'#0f172a',icons:[{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]};
}
