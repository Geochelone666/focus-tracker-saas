import { describe, expect, it } from 'vitest';
import { calendarMonth, parseSchedule, validDate } from './calendar';

function form(fields: Record<string, string | undefined>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) { if (value !== undefined) data.set(key, value); }
  return data;
}
describe('schedule input', () => {
  it('allows a title and date without optional details', () => {
    expect(parseSchedule(form({ title: ' 周会 ', scheduled_date: '2026-10-20' })))
      .toEqual({ title: '周会', scheduled_date: '2026-10-20', scheduled_time: null, notes: null });
  });
  it('accepts optional time and notes', () => {
    expect(parseSchedule(form({ title: '周会', scheduled_date: '2028-02-29', scheduled_time: '09:30', notes: ' 材料 ' })))
      .toMatchObject({ scheduled_time: '09:30', notes: '材料' });
  });
  it.each([
    { title: '  ', scheduled_date: '2026-10-20' },
    { title: 'x', scheduled_date: '2026-02-29' },
    { title: 'x', scheduled_date: '2026-10-20', scheduled_time: '24:00' },
    { title: 'x'.repeat(121), scheduled_date: '2026-10-20' },
    { title: 'x', scheduled_date: '2026-10-20', notes: 'x'.repeat(2001) },
  ])('rejects invalid values %j', fields => expect(() => parseSchedule(form(fields))).toThrow());
});
describe('calendar', () => {
  it('validates real dates without timezone conversion', () => {
    expect(validDate('2028-02-29')).toBe(true);
    expect(validDate('2026-02-29')).toBe(false);
    expect(validDate('2026-13-01')).toBe(false);
  });
  it('builds a Monday-first grid across year boundaries', () => {
    const month = calendarMonth('2027-01');
    expect(month.previous).toBe('2026-12');
    expect(month.next).toBe('2027-02');
    expect(month.days).toHaveLength(42);
    expect(month.days[0]).toBe('2026-12-28');
    expect(month.days[41]).toBe('2027-02-07');
  });
  it('includes leap day and rejects malformed months', () => {
    expect(calendarMonth('2028-02').days).toContain('2028-02-29');
    expect(() => calendarMonth('2026-13')).toThrow();
  });
});
