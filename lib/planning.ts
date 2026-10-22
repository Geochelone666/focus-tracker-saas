import { validDate } from './calendar';
import { validateId } from './validation';

export const DEFAULT_TIMEZONE = 'America/Toronto';
export const SCHEDULE_COLUMNS = 'id,title,scheduled_date,scheduled_time,notes,is_done,priority,estimated_minutes,energy,project_id,skill_id,series_id,deleted_at,deferral_reason';
export type Schedule = {
  id: string; title: string; scheduled_date: string | null; scheduled_time: string | null;
  notes: string | null; is_done: boolean; priority: 'low' | 'normal' | 'high';
  estimated_minutes: number | null; energy: string | null; project_id: string | null;
  skill_id: string | null; series_id: string | null; deleted_at: string | null; deferral_reason: string | null;
};
export type Choice = { id: string; name: string };
export function timezone(value: unknown): string {
  if (typeof value !== 'string' || value.length > 100) return DEFAULT_TIMEZONE;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return value; } catch { return DEFAULT_TIMEZONE; }
}
export function dayKey(now = new Date(), zone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone(zone), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
export function addDays(day: string, count: number) {
  if (!validDate(day) || !Number.isInteger(count)) throw new Error('Invalid date');
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  const result = date.toISOString().slice(0, 10);
  if (!validDate(result) || result < '0002-01-01' || result > '9998-12-31') throw new Error('Date is out of range');
  return result;
}
export function textField(form: FormData, name: string, max = 2000): string {
  const value = form.get(name);
  if (value !== null && typeof value !== 'string') throw new Error('Invalid field');
  const text = (value ?? '').trim();
  if (text.length > max) throw new Error(`${name} is too long`);
  return text;
}
export function parsePlan(form: FormData) {
  const title = textField(form, 'title', 120);
  const date = textField(form, 'scheduled_date', 10) || null;
  const time = textField(form, 'scheduled_time', 5) || null;
  const priority = textField(form, 'priority', 10) || 'normal';
  const energy = textField(form, 'energy', 10) || null;
  const estimate = textField(form, 'estimated_minutes', 4);
  if (!title || (date && (!validDate(date) || date < '0002-01-01' || date > '9998-12-31')) ||
      (time && (!date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) ||
      !['low', 'normal', 'high'].includes(priority) || (energy && !['low', 'medium', 'high'].includes(energy)) ||
      (estimate && (!/^\d+$/.test(estimate) || Number(estimate) < 1 || Number(estimate) > 1440))) throw new Error('Invalid plan');
  const optionalId = (name: string) => { const value = textField(form, name, 36); return value ? validateId(value) : null; };
  return { title, scheduled_date: date, scheduled_time: time, notes: textField(form, 'notes') || null,
    priority, energy, estimated_minutes: estimate ? Number(estimate) : null,
    project_id: optionalId('project_id'), skill_id: optionalId('skill_id') };
}
export function recurrenceDates(date: string | null, repeat: string, count: number): Array<string | null> {
  if (!['none', 'daily', 'weekly'].includes(repeat)) throw new Error('Invalid repeat');
  if (repeat === 'none') return [date];
  if (!date || !Number.isInteger(count) || count < 2 || count > 52) throw new Error('Choose 2–52 occurrences and a start date');
  return Array.from({ length: count }, (_, i) => addDays(date, i * (repeat === 'weekly' ? 7 : 1)));
}
export function sortPlans(items: Schedule[]): Schedule[] {
  const rank = { high: 0, normal: 1, low: 2 };
  return [...items].sort((a,b) => Number(a.is_done) - Number(b.is_done) || rank[a.priority] - rank[b.priority] || (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? '') || a.id.localeCompare(b.id));
}
export function plannedMinutes(items: Schedule[], buffer = 0) {
  return items.filter(item => !item.is_done).reduce((sum, item) => sum + (item.estimated_minutes ?? 0) + buffer, 0);
}

export type Reminder = { id: string; title: string; scheduled_date: string | null; scheduled_time: string | null };
export function dueSoon(items: Reminder[], now: Date, zone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone(zone), year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  // Plans have minute precision. Advance actual instants so a DST jump cannot
  // invent a nonexistent minute or hide an upcoming repeated wall-clock time.
  const upcoming = new Set(Array.from({ length: 11 }, (_, minute) => {
    const parts = formatter.formatToParts(new Date(now.getTime() + minute * 60_000));
    const part = (type: string) => parts.find(value => value.type === type)!.value;
    return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
  }));
  return items.filter(item => item.scheduled_date && item.scheduled_time &&
    upcoming.has(`${item.scheduled_date}T${item.scheduled_time.slice(0, 5)}`));
}
