import Link from 'next/link';
import { planningContext } from '@/lib/planning-data';
import { readAnalytics,reportRange } from '@/lib/analytics-report';
import { PlannedActual } from '@/components/planned-actual';
import { readAllRows } from '@/lib/paginated-query';
export default async function ReviewPage({searchParams}:{searchParams:Promise<{range?:string;from?:string;to?:string;page?:string}>}){
 const params=await searchParams,context=await planningContext();
 const range=reportRange(params,context.today),report=await readAnalytics(context.supabase,range.from,range.to,range.page);
 const reflections=await readAllRows<{day:string;note:string}>((from,to)=>context.supabase.from('daily_reflections').select('day,note').eq('user_id',context.user.id).gte('day',range.from).lte('day',range.to).order('day',{ascending:false}).range(from,to));
 return <main className="mx-auto max-w-5xl px-4 py-10"><h1 className="text-3xl font-bold">Review · Planned vs Actual</h1><p className="my-3 text-sm">{range.from} – {range.to} · {context.zone}. Use what you learn to leave more room in the next plan.</p>
  <nav aria-label="Review range" className="my-4 flex gap-4"><Link href="?range=7" className="underline">7 days</Link><Link href="?range=30" className="underline">30 days</Link></nav>
  <form className="my-4 flex flex-wrap items-end gap-3"><input type="hidden" name="range" value="custom"/><label className="text-sm">From<input type="date" name="from" defaultValue={range.from} className="mt-1 block rounded border p-2"/></label><label className="text-sm">To<input type="date" name="to" defaultValue={range.to} className="mt-1 block rounded border p-2"/></label><button className="rounded bg-slate-900 px-4 py-2 text-white">Update range</button></form>
  {range.error&&<p role="alert" className="text-red-800">{range.error}</p>}
  <PlannedActual report={report} from={range.from} to={range.to} page={range.page}/>
  <section className="my-5 rounded border bg-white p-4"><h2 className="font-semibold">Daily reflections</h2>{reflections.filter(item=>item.note).length===0?<p className="mt-3 text-sm text-slate-500">No reflections in this range. Add one on Today.</p>:reflections.filter(item=>item.note).map(item=><article key={item.day} className="my-3"><h3 className="text-sm font-medium">{item.day}</h3><p className="break-words whitespace-pre-wrap text-sm">{item.note}</p></article>)}</section>
  <Link href="/today" className="underline">Adjust your next plan →</Link>
 </main>;
}
