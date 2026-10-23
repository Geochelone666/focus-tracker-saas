'use server';
import { randomBytes,createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { planningContext } from '@/lib/planning-data';
import { validateId } from '@/lib/validation';
export type KeyState={error?:string;token?:string};
export async function createKey(_state:KeyState,form:FormData):Promise<KeyState>{
 const name=String(form.get('name')??'').trim(),scope=String(form.get('scope')),days=Number(form.get('days'));
 if(!name || name.length>80 || !['read','write'].includes(scope) || ![7,30,90].includes(days))return {error:'Choose a name, permission, and expiry.'};
 const {supabase,user}=await planningContext();
 const token='ft_'+randomBytes(32).toString('hex');
 const {error}=await supabase.from('integration_tokens').insert({user_id:user.id,name,scope,token_hash:createHash('sha256').update(token).digest('hex'),expires_at:new Date(Date.now()+days*86400000).toISOString()});
 if(error)return {error:'Could not create key. Check migration 20261023000000 and retry.'};
 revalidatePath('/settings/integrations');return {token};
}
export async function revokeKey(form:FormData){
 const {supabase,user}=await planningContext();
 let id;try{id=validateId(form.get('id'));}catch{return {error:'Invalid key'};}
 const {error}=await supabase.from('integration_tokens').update({revoked_at:new Date().toISOString()}).eq('id',id).eq('user_id',user.id);
 revalidatePath('/settings/integrations');return error?{error:'Could not revoke key. Please try again.'}:{success:true};
}
