import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/supabase/server';
import { readAllRows } from '@/lib/paginated-query';
import { calendarMonth, validDate } from '@/lib/calendar';
import { addSchedule, toggleSchedule } from './actions';

type Schedule = { id: string; title: string; scheduled_date: string; scheduled_time: string | null; notes: string | null; is_done: boolean };
const fieldClass = 'w-full rounded-md border border-slate-300 px-3 py-2';

export default async function CalendarPage({ searchParams }: { searchParams: { date?: string; month?: string; error?: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const selected = typeof searchParams.date === 'string' && validDate(searchParams.date) ? searchParams.date : today;
  let month = typeof searchParams.month === 'string' ? searchParams.month : selected.slice(0, 7);
  let calendar;
  try { calendar = calendarMonth(month); }
  catch { month = today.slice(0, 7); calendar = calendarMonth(month); }
  let schedules: Schedule[] = [];
  let loadFailed = false;
  try {
    schedules = await readAllRows((from, to) => supabase.from('schedules')
      .select('id, title, scheduled_date, scheduled_time, notes, is_done').eq('user_id', user.id)
      .gte('scheduled_date', calendar.days[0]).lte('scheduled_date', calendar.days[41])
      .order('scheduled_date').order('scheduled_time', { nullsFirst: true }).order('id').range(from, to));
  } catch { loadFailed = true; }
  const selectedSchedules = schedules.filter(item => item.scheduled_date === selected);
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 text-slate-900">
      <h1 className="text-3xl font-bold">日程与日历</h1>
      <p className="mt-2 mb-6 text-slate-600">安排每天的计划，完成后打勾。时间和备注均可留空。</p>
      {typeof searchParams.error === 'string' && <p role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-800">{searchParams.error}</p>}
      {loadFailed && <p role="alert" className="mb-4 rounded bg-red-50 p-4 text-red-800">日程加载失败，请刷新重试。首次使用请确认已应用日程数据库迁移。</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="min-w-0 rounded-lg border bg-white p-3 sm:p-5" aria-label="月历">
          <nav className="mb-5 flex items-center justify-between gap-2" aria-label="切换月份">
            <Link href={`?month=${calendar.previous}&date=${calendar.previous}-01`} className="rounded border px-2 py-2" aria-label="上个月">←</Link>
            <h2 className="font-semibold">{month.replace('-', ' 年 ')} 月</h2>
            <Link href={`?date=${today}`} className="text-sm underline">今天</Link>
            <Link href={`?month=${calendar.next}&date=${calendar.next}-01`} className="rounded border px-2 py-2" aria-label="下个月">→</Link>
          </nav>
          <div className="grid grid-cols-7 text-center text-sm">
            {['一', '二', '三', '四', '五', '六', '日'].map(day => <div key={day} className="pb-3 text-slate-500">{day}</div>)}
            {calendar.days.map(date => {
              const items = schedules.filter(item => item.scheduled_date === date);
              const remaining = items.filter(item => !item.is_done).length;
              return <Link key={date} href={`?date=${date}`} aria-current={date === selected ? 'date' : undefined}
                aria-label={`${date}，${items.length} 项日程，${remaining} 项未完成`}
                className={`flex min-h-20 flex-col items-center gap-1 border p-1 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 ${date === selected ? 'border-slate-900 bg-slate-100' : 'border-slate-100'} ${date.startsWith(month) ? '' : 'text-slate-400'}`}>
                <span className={date === today ? 'rounded-full bg-slate-900 px-2 text-white' : ''}>{Number(date.slice(-2))}</span>
                {items.length > 0 && <span className="text-xs">{remaining ? `${remaining} 待办` : '✓ 完成'}</span>}
              </Link>;
            })}
          </div>
        </section>
        <section className="rounded-lg border bg-white p-5">
          <h2 className="mb-4 text-lg font-semibold">新增日程</h2>
          <form key={selected} action={addSchedule} className="space-y-4">
            <label className="block">日程名称<input name="title" required maxLength={120} className={fieldClass} placeholder="准备周会" /></label>
            <label className="block">日期<input name="scheduled_date" type="date" required defaultValue={selected} min="0002-01-01" max="9998-12-31" className={fieldClass} /></label>
            <label className="block">时间（可选）<input name="scheduled_time" type="time" className={fieldClass} /></label>
            <label className="block">备注（可选）<textarea name="notes" maxLength={2000} rows={3} className={fieldClass} /></label>
            <button className="w-full rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700" type="submit">保存日程</button>
          </form>
        </section>
      </div>
      <section className="mt-6 rounded-lg border bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold">{selected} 的日程</h2>
        {!loadFailed && selectedSchedules.length === 0 && <p className="text-slate-500">当天暂无日程，添加一个新计划吧。</p>}
        <ul className="divide-y">
          {selectedSchedules.map(item => <li key={item.id} className="flex items-start gap-3 py-4">
            <form action={toggleSchedule.bind(null, item.id, !item.is_done)}>
              <button type="submit" role="checkbox" aria-checked={item.is_done} aria-label={`${item.is_done ? '取消完成' : '标记完成'}：${item.title}`} className="h-7 w-7 rounded border border-slate-400 hover:bg-slate-100">{item.is_done ? '✓' : ''}</button>
            </form>
            <div className="min-w-0 flex-1">
              <p className={`break-words font-medium ${item.is_done ? 'text-slate-500 line-through' : ''}`}>{item.title}</p>
              <p className="text-sm text-slate-500">{item.scheduled_time?.slice(0, 5) ?? '全天'} · {item.is_done ? '已完成' : '待完成'}</p>
              {item.notes && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{item.notes}</p>}
            </div>
          </li>)}
        </ul>
      </section>
    </main>
  );
}
