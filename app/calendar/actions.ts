"use server";

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/supabase/server';
import { parseSchedule } from '@/lib/calendar';
import { validateId } from '@/lib/validation';

function fail(message: string): never {
  redirect('/calendar?error=' + encodeURIComponent(message));
}

async function authenticate() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect('/login');
  return { supabase, user };
}

export async function addSchedule(form: FormData) {
  let schedule;
  try { schedule = parseSchedule(form); }
  catch { fail('请填写日程名称和有效日期；名称最多 120 字，备注最多 2000 字。'); }
  const { supabase, user } = await authenticate();
  const { error } = await supabase.from('schedules').insert({ ...schedule, user_id: user.id });
  if (error) fail('保存失败，请稍后重试。');
  revalidatePath('/calendar');
  redirect('/calendar?date=' + schedule.scheduled_date);
}

export async function toggleSchedule(id: string, done: boolean) {
  try { id = validateId(id); if (typeof done !== 'boolean') throw new Error(); }
  catch { fail('无效的日程。'); }
  const { supabase, user } = await authenticate();
  const { error } = await supabase.from('schedules').update({ is_done: done })
    .eq('id', id).eq('user_id', user.id);
  if (error) fail('更新失败，请稍后重试。');
  revalidatePath('/calendar');
}
