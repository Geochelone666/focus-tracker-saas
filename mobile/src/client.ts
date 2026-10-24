import 'react-native-url-polyfill/auto';
import {createClient} from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
// Encrypted native storage, chunked below platform value-size limits. Commit a
// manifest only after all new chunks are written; serialize operations in JS.
let queue:Promise<unknown>=Promise.resolve();
function locked<T>(work:()=>Promise<T>):Promise<T>{const next=queue.then(work,work);queue=next.catch(()=>{});return next;}
type Manifest={prefix:string;count:number};
async function manifest(key:string):Promise<Manifest|null>{
 try{const raw=await SecureStore.getItemAsync(key);if(!raw)return null;const value=JSON.parse(raw);return typeof value.prefix==='string'&&Number.isInteger(value.count)&&value.count>0&&value.count<100?value:null;}catch{return null;}
}
async function removeChunks(value:Manifest|null){if(value)for(let i=0;i<value.count;i++)await SecureStore.deleteItemAsync(`${value.prefix}_${i}`);}
const storage={
 getItem:(key:string)=>locked(async()=>{const value=await manifest(key);if(!value)return null;let text='';for(let i=0;i<value.count;i++){const part=await SecureStore.getItemAsync(`${value.prefix}_${i}`);if(part===null)return null;text+=part;}return text;}),
 setItem:(key:string,text:string)=>locked(async()=>{const old=await manifest(key),prefix=key+'_'+Crypto.randomUUID(),chunks=Array.from(text).reduce<string[]>((parts,char)=>{if(!parts.length||Array.from(parts[parts.length-1]).length>=400)parts.push('');parts[parts.length-1]+=char;return parts;},[]),count=chunks.length;if(count<1||count>=100)throw new Error('Session is too large');for(let i=0;i<count;i++)await SecureStore.setItemAsync(`${prefix}_${i}`,chunks[i]);await SecureStore.setItemAsync(key,JSON.stringify({prefix,count}));await removeChunks(old);}),
 removeItem:(key:string)=>locked(async()=>{const value=await manifest(key);await SecureStore.deleteItemAsync(key);await removeChunks(value);})
};
const url=process.env.EXPO_PUBLIC_SUPABASE_URL,key=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const configured=Boolean(url&&key);
export const supabase=createClient(url||'https://example.invalid',key||'missing',{auth:{storage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
const rawOrigin=process.env.EXPO_PUBLIC_APP_ORIGIN??'https://focus-tracker-saas.vercel.app';
export const APP_ORIGIN=new URL(rawOrigin).origin;
if(!APP_ORIGIN.startsWith('https://')&&!__DEV__)throw new Error('Production API origin must use HTTPS');
export async function phoneRequest(path:string,method:string,body?:unknown){
 const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Please sign in again.');
 const response=await fetch(APP_ORIGIN+path,{method,headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json();if(!response.ok)throw new Error(result.error??'Could not connect. Please try again.');return result;
}

export const deviceRequest=(method:string,body?:unknown)=>phoneRequest('/api/push/devices',method,body);
