import Link from 'next/link';
import { planningContext, planningData } from '@/lib/planning-data';
import { addDays, dayKey } from '@/lib/planning';
import { getMidnightInTimeZone } from '@/lib/analytics';
import { readAllRows } from '@/lib/paginated-query';

export default async function ReviewPage() {
  const context = await planningContext();
  const { today, zone, supabase, user } = context;
  const { schedules, projects } = await planningData(context);
  const first = addDays(today,-6), previous = addDays(today,-13), tomorrow = addDays(today,1);
  const sessions = await readAllRows<{ schedule_id: string | null; started_at: string; duration_sec: number | null }>((from,to) => supabase.from('focus_sessions')
    .select('schedule_id,started_at,duration_sec').eq('user_id',user.id)
    .gte('started_at', getMidnightInTimeZone(new Date(`${previous}T00:00:00Z`),zone).toISOString())
    .lt('started_at', getMidnightInTimeZone(new Date(`${tomorrow}T00:00:00Z`),zone).toISOString()).order('id').range(from,to));
  const reflections = await readAllRows<{ day: string; note: string }>((from,to) => supabase.from('daily_reflections').select('day,note').eq('user_id',user.id).gte('day',first).lte('day',today).order('day',{ascending:false}).range(from,to));
  const days = Array.from({length:7},(_,i) => addDays(first,i));
  const minutesFor = (date: string) => sessions.filter(s => dayKey(new Date(s.started_at),zone) === date).reduce((sum,s) => sum+(s.duration_sec??0),0)/60;
  const minutes = days.map(minutesFor), total = minutes.reduce((sum,n)=>sum+n,0);
  const previousMinutes = sessions.filter(s => dayKey(new Date(s.started_at),zone) < first).reduce((sum,s)=>sum+(s.duration_sec??0),0)/60;
  const plans = schedules.filter(s => !s.deleted_at && s.scheduled_date && s.scheduled_date >= first && s.scheduled_date <= today);
  const done = plans.filter(s => s.is_done).length;
  const deferred = plans.filter(s => s.deferral_reason);
  const byProject = new Map<string,number>();
  for (const session of sessions) {
    if (dayKey(new Date(session.started_at),zone) < first) continue;
    const projectId = schedules.find(s => s.id === session.schedule_id)?.project_id;
    const name = projects.find(p => p.id === projectId)?.name ?? 'Unassigned';
    byProject.set(name,(byProject.get(name)??0)+(session.duration_sec??0)/60);
  }
  return <main className="mx-auto max-w-4xl px-4 py-10">
    <h1 className="text-3xl font-bold">Weekly Review</h1><p className="mt-2 mb-6 text-slate-600">{first} – {today} · {zone}. A little reflection helps you plan with more room.</p>
    <div className="grid gap-4 sm:grid-cols-3">
      <section className="rounded-lg border bg-white p-4"><h2 className="text-sm text-slate-500">Focused time</h2><p className="text-2xl font-semibold">{Math.floor(total)}m</p><p className="text-sm text-slate-500">Previous 7 days: {Math.floor(previousMinutes)}m</p></section>
      <section className="rounded-lg border bg-white p-4"><h2 className="text-sm text-slate-500">Scheduled plans completed</h2><p className="text-2xl font-semibold">{done}/{plans.length}</p><p className="text-sm text-slate-500">Plans dated within these 7 days</p></section>
      <section className="rounded-lg border bg-white p-4"><h2 className="text-sm text-slate-500">Days with focus</h2><p className="text-2xl font-semibold">{minutes.filter(n=>n>0).length}/7</p><p className="text-sm text-slate-500">Completed session time only</p></section>
    </div>
    <section className="mt-6 rounded-lg border bg-white p-5"><h2 className="mb-4 text-lg font-semibold">Your rhythm</h2>
      <div className="space-y-3">{days.map((date,i) => <div key={date}><div className="mb-1 flex justify-between text-sm"><span>{date}</span><span>{Math.floor(minutes[i])}m</span></div><div role="img" aria-label={`${date}: ${Math.floor(minutes[i])} minutes focused`} className="h-3 rounded bg-slate-100"><div className="h-3 rounded bg-slate-900" style={{width:`${minutes[i]/Math.max(1,...minutes)*100}%`}} /></div></div>)}</div>
    </section>
    <section className="mt-6 rounded-lg border bg-white p-5"><h2 className="mb-3 text-lg font-semibold">Time by project</h2>
      {byProject.size === 0 ? <p className="text-slate-500">Start focus from a task to see where your time goes.</p> : <ul>{[...byProject].sort((a,b)=>b[1]-a[1]).map(([name,n])=><li key={name} className="flex justify-between gap-3 py-2"><span className="break-words">{name}</span><span>{Math.floor(n)}m</span></li>)}</ul>}
    </section>
    {deferred.length > 0 && <section className="mt-6 rounded-lg border bg-white p-5"><h2 className="mb-3 text-lg font-semibold">Plans you adjusted</h2><ul className="space-y-2">{deferred.map(plan=><li key={plan.id} className="break-words text-sm">{plan.title}: {plan.deferral_reason}</li>)}</ul></section>}
    <section className="mt-6 rounded-lg border bg-white p-5"><h2 className="mb-3 text-lg font-semibold">Daily reflections</h2>
      {reflections.filter(r=>r.note).length === 0 && <p className="text-slate-500">Write a short reflection on Today to start your review journal.</p>}
      {reflections.filter(r=>r.note).map(reflection=><article key={reflection.day} className="border-b py-3"><h3 className="text-sm font-medium">{reflection.day}</h3><p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{reflection.note}</p></article>)}
    </section>
    <Link href="/today" className="mt-6 inline-block underline">Plan your next step →</Link>
  </main>;
}
