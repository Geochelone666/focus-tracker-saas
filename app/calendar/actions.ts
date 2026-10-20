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
  catch { fail('Enter a title (up to 120 characters), a valid date and time, and notes of up to 2000 characters.'); }
  const { supabase, user } = await authenticate();
  const { error } = await supabase.from('schedules').insert({ ...schedule, user_id: user.id });
  if (error) fail('Could not save your schedule. Please try again.');
  revalidatePath('/calendar');
  redirect('/calendar?date=' + schedule.scheduled_date);
}

export async function toggleSchedule(id: string, done: boolean) {
  try { id = validateId(id); if (typeof done !== 'boolean') throw new Error(); }
  catch { fail('This schedule could not be found. Please refresh and try again.'); }
  const { supabase, user } = await authenticate();
  const { error } = await supabase.from('schedules').update({ is_done: done })
    .eq('id', id).eq('user_id', user.id);
  if (error) fail('Could not update your schedule. Please try again.');
  revalidatePath('/calendar');
}

export async function updateSchedule(id: string, form: FormData) {
  let schedule;
  try { id = validateId(id); schedule = parseSchedule(form); }
  catch { fail('Enter a valid schedule title, date and optional time and notes.'); }
  const { supabase, user } = await authenticate();
  const { data, error } = await supabase.from('schedules').update(schedule)
    .eq('id', id).eq('user_id', user.id).select('id').maybeSingle();
  if (error || !data) fail('Could not update your schedule. It may have been removed. Please refresh and try again.');
  revalidatePath('/calendar');
  redirect('/calendar?date=' + schedule.scheduled_date);
}
