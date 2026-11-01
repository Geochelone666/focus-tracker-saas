import { readAnalytics } from '@/lib/analytics-report';
import { addDays } from '@/lib/planning';
import { TimeBlockCalendar } from '@/components/time-block-calendar';
import Link from 'next/link';
import { planningContext, planningData } from '@/lib/planning-data';
import { calendarMonth, validDate } from '@/lib/calendar';
import { PlanForm } from '@/components/plan-form';
import { sortPlans } from '@/lib/planning';
import { PlanCard } from '@/components/plan-card';

export default async function CalendarPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ date?: string; month?: string; view?: string; error?: string; status?: string }> }) {
  const searchParams = await searchParamsPromise;
  const context = await planningContext();
  const { today, zone } = context;
  const { schedules: allSchedules, projects, skills } = await planningData(context);
  const {data:taskTotals,error:taskError}=await context.supabase.rpc('task_focus_totals',{p_ids:allSchedules.map(item=>item.id)});
  if(taskError)throw taskError;
  const actual=new Map<string,number>((taskTotals??[]).map((row:{schedule_id:string;seconds:number})=>[row.schedule_id,Number(row.seconds)/60]));
  let selected = typeof searchParams.date === 'string' && validDate(searchParams.date) && searchParams.date >= '0002-01-01' && searchParams.date <= '9998-12-31' ? searchParams.date : today;
  let month = typeof searchParams.month === 'string' ? searchParams.month : selected.slice(0, 7);
  let calendar;
  try { calendar = calendarMonth(month); }
  catch { month = today.slice(0, 7); calendar = calendarMonth(month); }
  if (!calendar.days.includes(selected)) selected = `${month}-01`;
  const view=searchParams.view==='week'||searchParams.view==='month'?searchParams.view:'day';
  const start=view==='week'?addDays(selected,-((new Date(`${selected}T12:00:00Z`).getUTCDay()+6)%7)):selected;
  const totals=view==='month'?null:await readAnalytics(context.supabase,start,view==='week'?addDays(start,6):start);
  const status = searchParams.status === 'open' || searchParams.status === 'completed' ? searchParams.status : 'all';
  const schedules = allSchedules.filter(item => !item.deleted_at && item.scheduled_date && calendar.days.includes(item.scheduled_date));
  const daySchedules = sortPlans(schedules.filter(item => item.scheduled_date === selected));
  const selectedSchedules = daySchedules.filter(item => status === 'all' || item.is_done === (status === 'completed'));
  const dateHref = (date: string) => `?date=${date}&status=${status}&view=day`;
  const navigate = (date:string) => `?date=${date}&view=${view}&status=${status}`;
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-slate-900">
      <h1 className="text-3xl font-bold">Schedules & Calendar</h1>
      <p className="mt-2 mb-6 text-slate-600">Plan your day and check off your progress. Time and notes are optional.</p>
      {typeof searchParams.error === 'string' && <p role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-800">{searchParams.error}</p>}
      <nav aria-label="Calendar view" className="mb-4 flex gap-4">{(['day','week','month'] as const).map(item=><Link key={item} href={`?date=${selected}&view=${item}&status=${status}`} aria-current={view===item?'page':undefined} className="capitalize underline">{item}</Link>)}</nav>
      {totals&&<div className="my-4 grid gap-2 sm:grid-cols-3"><p>Planned: {totals.days.reduce((sum,day)=>sum+Number(day.planned_minutes??0),0)}m</p><p>Actual focus: {Math.floor(totals.days.reduce((sum,day)=>sum+Number(day.focus_seconds),0)/60)}m</p><p>Breaks: {Math.floor(totals.days.reduce((sum,day)=>sum+Number(day.break_seconds),0)/60)}m</p></div>}
      {view!=='month'&&<nav aria-label="Change displayed day" className="my-4 flex flex-wrap items-center gap-3 text-sm">
        <Link prefetch={false} href={navigate(addDays(selected,view==='week'?-7:-1))} className="rounded border px-3 py-2">Previous {view}</Link>
        <span className="font-medium">{view==='week'?start+' – '+addDays(start,6):selected}</span>
        <Link prefetch={false} href={navigate(today)} className="underline">Today</Link>
        <Link prefetch={false} href={navigate(addDays(selected,view==='week'?7:1))} className="rounded border px-3 py-2">Next {view}</Link>
      </nav>}
      {view!=='month'&&<TimeBlockCalendar tasks={allSchedules} date={selected} view={view} zone={zone}/>}
      {view==='month'&&<div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="min-w-0 rounded-lg border bg-white p-3 sm:p-5" aria-label="Monthly calendar">
          <nav className="mb-5 flex items-center justify-between gap-2" aria-label="Change month">
            <Link prefetch={false} href={`?date=${calendar.previous}-01&view=month&status=${status}`} className="rounded border px-2 py-2" aria-label="Previous month">←</Link>
            <h2 className="font-semibold">{new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))}</h2>
            <Link prefetch={false} href={`?date=${today}&view=month&status=${status}`} className="text-sm underline">Today</Link>
            <Link prefetch={false} href={`?date=${calendar.next}-01&view=month&status=${status}`} className="rounded border px-2 py-2" aria-label="Next month">→</Link>
          </nav>
          <div className="grid grid-cols-7 text-center text-sm">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="pb-3 text-slate-500">{day}</div>)}
            {calendar.days.map(date => {
              const items = schedules.filter(item => item.scheduled_date === date);
              const remaining = items.filter(item => !item.is_done).length;
              return <Link prefetch={false} key={date} href={dateHref(date)} aria-current={date === selected ? 'date' : undefined}
                aria-label={`${date}: ${items.length} schedules, ${remaining} remaining`}
                className={`flex min-h-20 flex-col items-center gap-1 border p-1 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 ${date === selected ? 'border-slate-900 bg-slate-100' : 'border-slate-100'} ${date.startsWith(month) ? '' : 'text-slate-400'}`}>
                <span className={date === today ? 'rounded-full bg-slate-900 px-2 text-white' : ''}>{Number(date.slice(-2))}</span>
                {items.length > 0 && <span className="text-xs">{remaining ? `${remaining} open` : '✓ Done'}</span>}
              </Link>;
            })}
          </div>
        </section>
        <section className="rounded-lg border bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">Add a schedule</h2>
          <PlanForm key={selected} date={selected} returnTo="/calendar" projects={projects.filter(p => !p.is_done)} skills={skills} />
        </section>
      </div>}
      {view!=='month'&&<section className="mb-6 max-w-xl rounded-lg border bg-white p-5" aria-label="Add a schedule"><details><summary className="cursor-pointer text-sm font-medium">Add a schedule</summary><div className="mt-4"><PlanForm key={selected} date={selected} returnTo="/calendar" projects={projects.filter(p=>!p.is_done)} skills={skills}/></div></details></section>}
      <section className="mt-6 rounded-lg border bg-white p-5">
        <h2 className="mb-2 text-lg font-semibold">Schedules for {selected}</h2>
        <p className="mb-4 text-sm text-slate-600">{daySchedules.filter(item => item.is_done).length} of {daySchedules.length} completed · Times follow {zone}.</p>
        <nav aria-label="Filter schedules" className="mb-4 flex gap-4 text-sm">
          {(['all', 'open', 'completed'] as const).map(filter => <Link prefetch={false} key={filter} href={`?date=${selected}&status=${filter}&view=${view}`} aria-current={status === filter ? 'page' : undefined} className={status === filter ? 'font-semibold underline' : 'text-slate-600 hover:underline'}>{filter === 'all' ? 'All' : filter === 'open' ? 'Open' : 'Completed'}</Link>)}
        </nav>
        {selectedSchedules.length === 0 && <p className="text-slate-500">{daySchedules.length ? 'No schedules match this filter.' : 'No schedules for this day. Add your first plan above.'}</p>}
        <ul className="space-y-3">
          {selectedSchedules.map(plan => <PlanCard actualMinutes={actual.get(plan.id)} series={allSchedules} key={plan.id} plan={plan} projects={projects} skills={skills} returnTo="/calendar" />)}
        </ul>
      </section>
    </main>
  );
}
