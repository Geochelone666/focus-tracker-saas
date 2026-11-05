import { calendarTaskChoices } from '@/lib/smart-scheduler/live-preview';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { planningContext } from '@/lib/planning-data';
import { SmartCalendarPlan } from '@/components/smart-calendar-plan';
export const dynamic='force-dynamic';
export default async function SmartPlanPage(){
  if(process.env.FOCUS_SMART_CALENDAR_ENABLED!=='true')notFound();
  const {supabase,user,today,zone}=await planningContext();
  const {data,error}=await supabase.rpc('calendar_preview_snapshot');
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
    <Link href="/calendar" className="underline">Back to calendar</Link>
    <h1 className="text-2xl font-semibold">Plan your time</h1>
    <p className="text-sm text-slate-600">Experimental Smart Calendar. Review every change before saving. Manually scheduled tasks stay fixed. All times use {zone}.</p>
    {error?<p role="alert">Calendar preview is unavailable. Check the experimental database setup, then reload.</p>:
      <SmartCalendarPlan owner={user.id} today={today} zone={zone} latestReceipt={data?.undo_receipt_id??null} initialTasks={data&&data.schedules.length<=500?calendarTaskChoices(data):[]}/>}
  </main>;
}
