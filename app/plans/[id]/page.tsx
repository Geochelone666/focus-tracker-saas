import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/supabase/server';
import {planningContext,planningData} from '@/lib/planning-data';
import {validateId} from '@/lib/validation';
import {PlanCard} from '@/components/plan-card';
export default async function PlanDetail({params}:{params:Promise<{id:string}>}){
 let id;try{id=validateId((await params).id);}catch{notFound();}
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();
 if(!user)redirect('/login?next='+encodeURIComponent('/plans/'+id));
 const context=await planningContext();const data=await planningData(context),plan=data.schedules.find(item=>item.id===id);
 if(!plan)notFound();
 const {data:totals,error}=await supabase.rpc('task_focus_totals',{p_ids:[plan.id]});if(error)throw error;
 const actual=totals?.[0]?Number(totals[0].seconds)/60:undefined;
 return <main className="mx-auto max-w-2xl space-y-5 px-4 py-10"><Link href="/today" prefetch={false} className="underline">Back to Today</Link><h1 className="text-3xl font-bold">Your plan</h1><p className="text-sm text-slate-600">Dates and times use {context.zone}. This is the latest saved version of your plan.</p><ul><PlanCard actualMinutes={actual} series={data.schedules} plan={plan} projects={data.projects} skills={data.skills}/></ul></main>;
}
