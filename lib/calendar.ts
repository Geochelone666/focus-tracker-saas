export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01' || value > '9999-12-31') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseSchedule(form: FormData) {
  const text = (name: string) => {
    const value = form.get(name);
    if (value !== null && typeof value !== 'string') throw new Error('Invalid field');
    return (value ?? '').trim();
  };
  const title = text('title');
  const scheduled_date = text('scheduled_date');
  const scheduled_time = text('scheduled_time') || null;
  const notes = text('notes') || null;
  if (!title || title.length > 120 || (!validDate(scheduled_date) || scheduled_date < '0002-01-01' || scheduled_date > '9998-12-31') ||
      (scheduled_time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduled_time)) ||
      (notes !== null && notes.length > 2000)) throw new Error('Invalid schedule');
  return { title, scheduled_date, scheduled_time, notes };
}

export function calendarMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month) || !validDate(`${month}-01`) || month < '0002-01' || month > '9998-12') throw new Error('Invalid month');
  const first = new Date(`${month}-01T00:00:00Z`);
  const next = new Date(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const previous = new Date(first);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const start = new Date(first);
  start.setUTCDate(1 - (first.getUTCDay() + 6) % 7);
  const days = Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + i);
    return day.toISOString().slice(0, 10);
  });
  return { days, previous: previous.toISOString().slice(0, 7), next: next.toISOString().slice(0, 7) };
}
