import { redirect } from 'next/navigation';
import { createClient } from '@/supabase/server';
import { readAllRows } from './paginated-query';
import { dayKey, timezone, SCHEDULE_COLUMNS, type Choice, type Schedule } from './planning';

export async function planningContext() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect('/login');
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('timezone,daily_focus_target_minutes').eq('user_id', user.id).maybeSingle();
  if (profileError) throw profileError;
  const zone = timezone(profile?.timezone);
  return { supabase, user, zone, today: dayKey(new Date(), zone), target: profile?.daily_focus_target_minutes ?? null };
}
export async function planningData(context: Awaited<ReturnType<typeof planningContext>>) {
  const { supabase, user } = context;
  const [schedules, projects, skills] = await Promise.all([
    readAllRows<Schedule>((from,to) => supabase.from('schedules').select(SCHEDULE_COLUMNS)
      .eq('user_id', user.id).order('id').range(from,to)),
    readAllRows<Choice & { is_done: boolean; description: string | null; target_date: string | null }>((from,to) => supabase.from('projects')
      .select('id,name,is_done,description,target_date').eq('user_id', user.id).order('created_at', { ascending: false }).order('id').range(from,to)),
    readAllRows<Choice>((from,to) => supabase.from('skills').select('id,name').eq('user_id', user.id).order('name').order('id').range(from,to))
  ]);
  return { schedules, projects, skills };
}
