import { readAnalytics } from '@/lib/analytics-report';
import Link from 'next/link';
import { planningContext, planningData } from '@/lib/planning-data';
import { addDays, plannedMinutes, sortPlans } from '@/lib/planning';
import { PlanForm } from '@/components/plan-form';
import { PlanCard } from '@/components/plan-card';
import { ReflectionForm } from '@/components/planning-forms';
import { Reminders } from '@/components/reminders';
import { FocusNext } from '@/components/focus-next';
import { FocusControls } from '@/components/focus-controls';
import { FOCUS_COLUMNS, type FocusSession } from '@/lib/focus-state';

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const context = await planningContext();
  const { supabase, user, today, zone, target } = context;
  const { schedules, projects, skills } = await planningData(context);
  const live = schedules.filter(item => !item.deleted_at);
  const plans = sortPlans(live.filter(item => item.scheduled_date === today));
  const overdue = sortPlans(live.filter(item => item.scheduled_date && item.scheduled_date < today && !item.is_done));
  const {data: taskTotals,error:totalsError}=await supabase.rpc('task_focus_totals',{p_ids:schedules.map(item=>item.id)});
  if(totalsError)throw totalsError;
  const taskSeconds=new Map<string,number>((taskTotals??[]).map((item:{schedule_id:string;seconds:number})=>[item.schedule_id,Number(item.seconds)]));
  const dayReport=await readAnalytics(supabase,today,today);
  const { data: running, error: runningError } = await supabase.from('focus_sessions').select(FOCUS_COLUMNS).eq('user_id',user.id).is('ended_at',null).maybeSingle();
  if (runningError) throw runningError;
  const active = running as FocusSession | null;
  const { data: lastPhase } = await supabase.from('focus_sessions').select(`${FOCUS_COLUMNS},note`).eq('user_id',user.id).order('started_at',{ascending:false}).limit(1).maybeSingle();
  const activePlan = active ? live.find(plan => plan.id === active.schedule_id) : null;
  const focused=Number(dayReport.days[0]?.focus_seconds??0)/60;
  const estimated = plannedMinutes(plans);
  const withBreaks = plannedMinutes(plans, 5);
  const { data: reflection, error } = await supabase.from('daily_reflections').select('note').eq('user_id',user.id).eq('day',today).maybeSingle();
  if (error) throw error;
  const actual=(id:string)=>taskSeconds.has(id)?taskSeconds.get(id)!/60:undefined;
  return <main className="mx-auto max-w-5xl px-4 py-10">
    <h1 className="text-3xl font-bold">Today</h1>
    <p className="mt-2 text-slate-600">{today} · {zone} · One step at a time.</p>
    {typeof params.error === 'string' && <p role="alert" className="mt-4 text-red-800">{params.error}</p>}
    <div className="my-6 grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border bg-white p-4"><p className="text-sm text-slate-500">Plans completed</p><p className="text-2xl font-semibold">{plans.filter(item => item.is_done).length} / {plans.length}</p></div>
      <div className="rounded-lg border bg-white p-4"><p className="text-sm text-slate-500">Focused today</p><p className="text-2xl font-semibold">{Math.floor(focused)}m{target ? ` / ${target}m` : ''}</p><Link href="/dashboard" className="text-sm underline">Manage focus goal</Link></div>
      <div className="rounded-lg border bg-white p-4"><p className="text-sm text-slate-500">Remaining planned work</p><p className="text-2xl font-semibold">{estimated}m</p><p className="text-xs text-slate-500">{withBreaks}m with 5-minute buffers</p></div>
    </div>
    <p className="mb-4 text-sm">Today: {dayReport.days[0]?.planned_minutes===null?'no estimates':`${dayReport.days[0]?.planned_minutes ?? 0}m total planned`} · {Math.floor(focused)}m actual focus · {Math.floor(Number(dayReport.days[0]?.break_seconds??0)/60)}m breaks. <Link href="/review" className="underline">Compare plan and actual →</Link></p>
    {estimated > 480 && <p role="status" className="mb-4 rounded border border-amber-200 bg-amber-50 p-4 text-amber-900">More than 8 hours are planned. Consider moving a few items or leaving room for breaks.</p>}
    {!active && lastPhase && <FocusNext key={lastPhase.id} session={lastPhase as FocusSession} skills={skills} />}
    {active && <section className="mb-6 rounded-lg border bg-white p-5">
      <h2 className="font-semibold">Focusing{activePlan ? `: ${activePlan.title}` : ''}</h2>
      <FocusControls key={active.id} session={active} skills={skills} observedAt={Date.now()} />
      <Link href="/dashboard" className="text-sm underline">Session recovery and details</Link>
    </section>}
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div>
        <section><h2 className="mb-3 text-xl font-semibold">Your day</h2>
          {plans.length === 0 && <p className="mb-4 text-slate-500">A fresh start. Add a plan or pick something from your Inbox.</p>}
          <ul className="space-y-3">{plans.map(plan => <PlanCard series={schedules} key={plan.id} plan={plan} projects={projects} skills={skills} actualMinutes={actual(plan.id)} />)}</ul>
        </section>
        {overdue.length > 0 && <section className="mt-6"><h2 className="mb-3 text-xl font-semibold">Carry-over · {overdue.length}</h2><p className="mb-3 text-sm text-slate-600">Plans change. Choose what still matters and reschedule the rest.</p>
          <ul className="space-y-3">{overdue.map(plan => <PlanCard series={schedules} key={plan.id} plan={plan} projects={projects} skills={skills} actualMinutes={actual(plan.id)} />)}</ul>
        </section>}
      </div>
      <aside className="space-y-6">
        <section className="rounded-lg border bg-white p-5"><h2 className="mb-3 font-semibold">Quick add</h2><PlanForm date={today} projects={projects.filter(p => !p.is_done)} skills={skills} /></section>
        <Reminders items={live.filter(plan => !plan.is_done && (plan.scheduled_date === today || plan.scheduled_date === addDays(today,1)))} zone={zone} userId={user.id} date={today} />
        <section className="rounded-lg border bg-white p-5"><h2 className="mb-3 font-semibold">Daily reflection</h2><ReflectionForm note={reflection?.note ?? ''} /></section>
        <Link href="/review" className="block text-sm underline">See your weekly review →</Link>
      </aside>
    </div>
  </main>;
}
