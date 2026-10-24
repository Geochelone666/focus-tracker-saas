import Link from 'next/link';
import { planningContext, planningData } from '@/lib/planning-data';
import { sortPlans } from '@/lib/planning';
import { PlanForm } from '@/components/plan-form';
import { PlanCard } from '@/components/plan-card';

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; status?: string; energy?: string; error?: string }> }) {
  const params = await searchParams;
  const context = await planningContext();
  const { schedules, projects, skills } = await planningData(context);
  const {data:taskTotals,error:taskError}=await context.supabase.rpc('task_focus_totals',{p_ids:schedules.map(item=>item.id)});
  if(taskError)throw taskError;
  const actual=new Map<string,number>((taskTotals??[]).map((row:{schedule_id:string;seconds:number})=>[row.schedule_id,Number(row.seconds)/60]));
  const view = params.view === 'all' || params.view === 'trash' ? params.view : 'inbox';
  const query = typeof params.q === 'string' ? params.q.slice(0,120).trim().toLowerCase() : '';
  const filtered = sortPlans(schedules.filter(item => {
    if (view === 'trash' ? !item.deleted_at : !!item.deleted_at) return false;
    if (view === 'inbox' && item.scheduled_date) return false;
    if (params.status === 'open' && item.is_done || params.status === 'completed' && !item.is_done) return false;
    if (['low','medium','high'].includes(params.energy ?? '') && item.energy !== params.energy) return false;
    return !query || `${item.title} ${item.notes ?? ''}`.toLowerCase().includes(query);
  }));
  return <main className="mx-auto max-w-5xl px-4 py-10">
    <h1 className="text-3xl font-bold">Inbox & Tasks</h1><p className="mt-2 mb-6 text-slate-600">Capture ideas now. Give them a date when you are ready.</p>
    {typeof params.error === 'string' && <p role="alert" className="mb-4 text-red-800">{params.error}</p>}
    <nav aria-label="Task views" className="mb-4 flex gap-4">{['inbox','all','trash'].map(tab => <Link prefetch={false} key={tab} href={`?view=${tab}`} aria-current={view === tab ? 'page' : undefined} className={view === tab ? 'font-semibold underline' : 'underline'}>{tab === 'inbox' ? 'Inbox' : tab === 'all' ? 'All tasks' : 'Trash'}</Link>)}</nav>
    <form className="mb-6 flex flex-wrap items-end gap-3">
      <input type="hidden" name="view" value={view} />
      <label className="text-sm">Search<input name="q" defaultValue={query} maxLength={120} placeholder="Title or notes" className="mt-1 block rounded border px-3 py-2" /></label>
      <label className="text-sm">Status<select aria-label="Status" name="status" defaultValue={params.status ?? ''} className="mt-1 block rounded border bg-white px-3 py-2"><option value="">All statuses</option><option value="open">Open</option><option value="completed">Completed</option></select></label>
      <label className="text-sm">Energy<select aria-label="Energy" name="energy" defaultValue={params.energy ?? ''} className="mt-1 block rounded border bg-white px-3 py-2"><option value="">All energy levels</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <button className="rounded border px-3 py-2 text-sm">Search & filter</button>
    </form>
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section><h2 className="mb-3 font-semibold">{filtered.length} {view === 'trash' ? 'removed plans' : 'plans'}</h2>
        {filtered.length === 0 && <p className="text-slate-500">No plans match this view.</p>}
        <ul className="space-y-3">{filtered.map(plan => <PlanCard actualMinutes={actual.get(plan.id)} series={schedules} key={plan.id} plan={plan} projects={projects} skills={skills} returnTo="/inbox" />)}</ul>
      </section>
      <section className="h-fit rounded-lg border bg-white p-5"><h2 className="mb-3 font-semibold">Capture a task</h2><PlanForm returnTo="/inbox" projects={projects.filter(p => !p.is_done)} skills={skills} /></section>
    </div>
  </main>;
}
