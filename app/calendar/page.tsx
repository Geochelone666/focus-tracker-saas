import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/supabase/server';
import { readAllRows } from '@/lib/paginated-query';
import { calendarMonth, validDate } from '@/lib/calendar';
import { addSchedule, toggleSchedule, updateSchedule } from './actions';

import { SubmitButton } from '@/components/submit-button';

type Schedule = { id: string; title: string; scheduled_date: string; scheduled_time: string | null; notes: string | null; is_done: boolean };

const fieldClass = 'w-full rounded-md border border-slate-300 px-3 py-2';

export default async function CalendarPage({ searchParams: searchParamsPromise }: { searchParams: Promise<{ date?: string; month?: string; error?: string; status?: string }> }) {
  const searchParams = await searchParamsPromise;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  let selected = typeof searchParams.date === 'string' && validDate(searchParams.date) && searchParams.date >= '0002-01-01' && searchParams.date <= '9998-12-31' ? searchParams.date : today;
  let month = typeof searchParams.month === 'string' ? searchParams.month : selected.slice(0, 7);
  let calendar;
  try { calendar = calendarMonth(month); }
  catch { month = today.slice(0, 7); calendar = calendarMonth(month); }
  if (!calendar.days.includes(selected)) selected = `${month}-01`;
  const status = searchParams.status === 'open' || searchParams.status === 'completed' ? searchParams.status : 'all';
  let schedules: Schedule[] = [];
  let loadFailed = false;
  try {
    schedules = await readAllRows((from, to) => supabase.from('schedules')
      .select('id, title, scheduled_date, scheduled_time, notes, is_done').eq('user_id', user.id)
      .gte('scheduled_date', calendar.days[0]).lte('scheduled_date', calendar.days[41])
      .order('scheduled_date').order('scheduled_time', { nullsFirst: true }).order('id').range(from, to));
  } catch { loadFailed = true; }
  const daySchedules = schedules.filter(item => item.scheduled_date === selected);
  const selectedSchedules = daySchedules.filter(item => status === 'all' || item.is_done === (status === 'completed'));
  const dateHref = (date: string) => `?date=${date}&status=${status}`;
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-slate-900">
      <h1 className="text-3xl font-bold">Schedules & Calendar</h1>
      <p className="mt-2 mb-6 text-slate-600">Plan your day and check off your progress. Time and notes are optional.</p>
      {typeof searchParams.error === 'string' && <p role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-800">{searchParams.error}</p>}
      {loadFailed && <p role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-800">We could not load your schedules. Please refresh and try again.</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="min-w-0 rounded-lg border bg-white p-3 sm:p-5" aria-label="Monthly calendar">
          <nav className="mb-5 flex items-center justify-between gap-2" aria-label="Change month">
            <Link href={dateHref(`${calendar.previous}-01`)} className="rounded border px-2 py-2" aria-label="Previous month">←</Link>
            <h2 className="font-semibold">{new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))}</h2>
            <Link href={dateHref(today)} className="text-sm underline">Today</Link>
            <Link href={dateHref(`${calendar.next}-01`)} className="rounded border px-2 py-2" aria-label="Next month">→</Link>
          </nav>
          <div className="grid grid-cols-7 text-center text-sm">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <div key={day} className="pb-3 text-slate-500">{day}</div>)}
            {calendar.days.map(date => {
              const items = schedules.filter(item => item.scheduled_date === date);
              const remaining = items.filter(item => !item.is_done).length;
              return <Link key={date} href={dateHref(date)} aria-current={date === selected ? 'date' : undefined}
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
          <form key={selected} action={addSchedule} className="space-y-4">
            <label className="block">Title<input name="title" required maxLength={120} className={fieldClass} placeholder="Prepare for a meeting" /></label>
            <label className="block">Date<input name="scheduled_date" type="date" required defaultValue={selected} min="0002-01-01" max="9998-12-31" className={fieldClass} /></label>
            <label className="block">Time (optional)<input name="scheduled_time" type="time" className={fieldClass} /></label>
            <label className="block">Notes (optional)<textarea name="notes" maxLength={2000} rows={3} className={fieldClass} /></label>
            <SubmitButton label="Save schedule" pendingLabel="Saving…" />
          </form>
        </section>
      </div>
      <section className="mt-6 rounded-lg border bg-white p-5">
        <h2 className="mb-2 text-lg font-semibold">Schedules for {selected}</h2>
        <p className="mb-4 text-sm text-slate-600">{!loadFailed && `${daySchedules.filter(item => item.is_done).length} of ${daySchedules.length} completed · `}Times are shown as entered. Today follows America/Toronto.</p>
        <nav aria-label="Filter schedules" className="mb-4 flex gap-4 text-sm">
          {(['all', 'open', 'completed'] as const).map(filter => <Link key={filter} href={`?date=${selected}&status=${filter}`} aria-current={status === filter ? 'page' : undefined} className={status === filter ? 'font-semibold underline' : 'text-slate-600 hover:underline'}>{filter === 'all' ? 'All' : filter === 'open' ? 'Open' : 'Completed'}</Link>)}
        </nav>
        {!loadFailed && selectedSchedules.length === 0 && <p className="text-slate-500">{daySchedules.length ? 'No schedules match this filter.' : 'No schedules for this day. Add your first plan above.'}</p>}
        <ul className="divide-y">
          {selectedSchedules.map(item => <li key={item.id} className="flex items-start gap-3 py-4">
            <form action={toggleSchedule.bind(null, item.id, !item.is_done)}>
              <button type="submit" role="checkbox" aria-checked={item.is_done} aria-label={`${item.is_done ? 'Mark incomplete' : 'Mark complete'}: ${item.title}`} className="h-7 w-7 rounded border border-slate-400 hover:bg-slate-100">{item.is_done ? '✓' : ''}</button>
            </form>
            <div className="min-w-0 flex-1">
              <p className={`break-words font-medium ${item.is_done ? 'text-slate-500 line-through' : ''}`}>{item.title}</p>
              <p className="text-sm text-slate-500">{item.scheduled_time?.slice(0, 5) ?? 'All day'} · {item.is_done ? 'Completed' : 'Open'}</p>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium underline">Edit or reschedule</summary>
                <form action={updateSchedule.bind(null, item.id)} className="mt-3 max-w-md space-y-3">
                  <label className="block text-sm">Title<input name="title" required maxLength={120} defaultValue={item.title} className={fieldClass} /></label>
                  <label className="block text-sm">Date<input name="scheduled_date" type="date" required min="0002-01-01" max="9998-12-31" defaultValue={item.scheduled_date} className={fieldClass} /></label>
                  <label className="block text-sm">Time (optional)<input name="scheduled_time" type="time" defaultValue={item.scheduled_time?.slice(0, 5) ?? ''} className={fieldClass} /></label>
                  <label className="block text-sm">Notes (optional)<textarea name="notes" rows={3} maxLength={2000} defaultValue={item.notes ?? ''} className={fieldClass} /></label>
                  <SubmitButton label="Save changes" pendingLabel="Saving…" />
                </form>
              </details>
              {item.notes && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{item.notes}</p>}
            </div>
          </li>)}
        </ul>
      </section>
    </main>
  );
}
