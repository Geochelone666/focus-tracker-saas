import type { SupabaseClient } from '@supabase/supabase-js';
import { validateId } from './validation';
export type GuideTask = {
  id: string;
  title: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  estimated_minutes: number | null;
  is_done: boolean;
  skill_id: string | null;
};
const columns = 'id,title,scheduled_date,scheduled_time,estimated_minutes,is_done,skill_id';
export async function readGettingStarted(
  client: SupabaseClient,
  owner: string,
  requested?: string
) {
  if (requested) validateId(requested);
  const [recent, active] = await Promise.all([
    client
      .from('schedules')
      .select(columns)
      .eq('user_id', owner)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .order('id')
      .limit(30),
    client
      .from('focus_sessions')
      .select('id,schedule_id,focus_status,session_kind')
      .eq('user_id', owner)
      .is('ended_at', null)
      .maybeSingle(),
  ]);
  if (recent.error || active.error) throw new Error('Guide unavailable');
  const tasks = (recent.data ?? []) as GuideTask[];
  let task: GuideTask | null = tasks[0] ?? null;
  if (requested) {
    const selected = await client
      .from('schedules')
      .select(columns)
      .eq('user_id', owner)
      .eq('id', requested)
      .is('deleted_at', null)
      .maybeSingle();
    if (selected.error) throw new Error('Guide unavailable');
    task = selected.data as GuideTask | null;
  }
  let actualSeconds: number | null = null;
  if (task) {
    const totals = await client.rpc('task_focus_totals', { p_ids: [task.id] });
    if (totals.error) throw new Error('Guide unavailable');
    const total = totals.data?.find((row: { schedule_id: string }) => row.schedule_id === task.id);
    actualSeconds = total ? Number(total.seconds) : null;
  }
  return { tasks, task, active: active.data, actualSeconds };
}
