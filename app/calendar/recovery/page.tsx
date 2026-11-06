import Link from 'next/link';
import {notFound} from 'next/navigation';
import {planningContext} from '@/lib/planning-data';
import {addDays} from '@/lib/planning';
import {validDate} from '@/lib/calendar';
import {recoveryStatus,type RecoveryTask} from '@/lib/execution-recovery';
import {RecoveryContextForm} from '@/components/recovery-context-form';
import {startSession} from '@/app/dashboard/actions';
import {SubmitButton} from '@/components/submit-button';
export const dynamic='force-dynamic';
export default async function RecoveryPage({searchParams}:{searchParams:Promise<{from?:string;to?:string;offset?:string}>}){
 if(process.env.FOCUS_EXECUTION_RECOVERY_ENABLED!=='true')notFound();
 const context=await planningContext();const params=await searchParams;
 const from=params.from??addDays(context.today,-6),to=params.to??context.today,offset=Number(params.offset??0);
 const valid=validDate(from)&&validDate(to)&&from>='0002-01-01'&&to<='9998-12-31'&&to>=from&&(Date.parse(to)-Date.parse(from))/86400000<=30&&Number.isInteger(offset)&&offset>=0&&offset<=100000;
 const {data,error}=valid?await context.supabase.rpc('task_recovery_snapshot',{p_from:from,p_to:to,p_offset:offset}):{data:null,error:null};
 const tasks:RecoveryTask[]=data?.tasks??[];
 const pageLink=(next:number)=>`?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&offset=${next}`;
 return <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
  <Link href="/calendar" className="underline">Back to calendar</Link><h1 className="text-2xl font-semibold">Pick up where you left off</h1>
  <p className="text-sm text-slate-600">Review open tasks planned or focused on in this range, plus active sessions, at your own pace. Recorded focus and planned time are separate; stopping a timer never completes a task. Dates use {context.zone}.</p>
  <form className="flex flex-wrap items-end gap-3"><label>From<input type="date" name="from" defaultValue={from} required className="block rounded border p-2"/></label><label>To<input type="date" name="to" defaultValue={to} required className="block rounded border p-2"/></label><button className="rounded border px-3 py-2">Review open tasks</button></form>
  {!valid&&<p role="alert">Choose a range of up to 31 days and a valid page.</p>}
  {error&&<p role="alert">Recovery context could not be loaded. Please <Link href={pageLink(offset)} className="underline">retry</Link>.</p>}
  {valid&&!error&&!tasks.length&&<p>No open tasks in this range. Choose another date range or add a task in Inbox.</p>}
  {tasks.map(task=><article key={task.id} className="space-y-4 rounded border bg-white p-4">
   <h2 className="text-lg font-semibold">{task.title}</h2>
   <p className="text-sm">{recoveryStatus(task,context.zone,Date.parse(data.captured_at)).label}</p>
   <p className="text-sm">{task.scheduled_date??'Inbox'} · {task.scheduled_time?.slice(0,5)??'No time chosen'} · {task.estimated_minutes===null?'Original estimate unknown':`${task.estimated_minutes}m originally planned`} · {task.actual_seconds===null?'No completed focus recorded':`${Number((task.actual_seconds/60).toFixed(1))}m recorded focus`}</p>
   {task.notes&&<p className="whitespace-pre-wrap break-words text-sm">Task notes: {task.notes}</p>}
   {task.latest_session?.note&&<p className="whitespace-pre-wrap break-words text-sm">Last focus outcome: {task.latest_session.note}</p>}
   <RecoveryContextForm task={task}/>
   <div className="flex flex-wrap items-center gap-4">
    {task.active_status?<Link href="/today" className="underline">Return to active session</Link>:<form action={startSession}><input type="hidden" name="schedule_id" value={task.id}/><input type="hidden" name="skill_id" value={task.skill_id??''}/><SubmitButton label="Continue focus" pendingLabel="Starting…"/></form>}
    <Link href={`/calendar?date=${task.scheduled_date??context.today}&view=day`} className="underline">Rearrange time block</Link><Link href={`/plans/${task.id}`} className="underline">Edit, postpone or complete task</Link>
   </div>
  </article>)}
  {valid&&!error&&<nav aria-label="Recovery pages" className="flex gap-4">{offset>0&&<Link href={pageLink(Math.max(0,offset-25))} className="underline">Previous tasks</Link>}{offset+25<Number(data?.total??0)&&<Link href={pageLink(offset+25)} className="underline">More tasks</Link>}</nav>}
 </main>;
}
