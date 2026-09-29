import { describe, expect, it } from 'vitest';

import {
  buildAnalyticsDays,
  buildSkillStats,
  formatDuration,
  getDateKey,
  getTorontoMidnight,
  getMidnightInTimeZone,
  getTodayRangeUtc,
  getDailyProgressPercent,
  groupSecondsByDay,
  sumDurations,
} from './analytics';

describe('getDateKey', () => {
  it('changes days at Toronto midnight', () => {
    expect(getDateKey(new Date('2026-09-29T03:59:59Z'))).toBe('2026-09-28');
    expect(getDateKey(new Date('2026-09-29T04:00:00Z'))).toBe('2026-09-29');
  });

  it('keeps the same calendar day across spring forward', () => {
    expect(getDateKey(new Date('2026-03-08T06:59:59Z'))).toBe('2026-03-08');
    expect(getDateKey(new Date('2026-03-08T07:00:00Z'))).toBe('2026-03-08');
  });

  it('keeps the same calendar day across fall back', () => {
    expect(getDateKey(new Date('2026-11-01T05:59:59Z'))).toBe('2026-11-01');
    expect(getDateKey(new Date('2026-11-01T06:00:00Z'))).toBe('2026-11-01');
  });
});

describe('getTorontoMidnight', () => {
  it('uses the midnight offsets before and after spring forward', () => {
    expect(getTorontoMidnight(new Date('2026-03-08T00:00:00Z')).toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(getTorontoMidnight(new Date('2026-03-09T00:00:00Z')).toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  it('uses the midnight offsets before and after fall back', () => {
    expect(getTorontoMidnight(new Date('2026-11-01T00:00:00Z')).toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(getTorontoMidnight(new Date('2026-11-02T00:00:00Z')).toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });
});

describe('formatDuration', () => {
  it('formats null, zero and negative input as 0m', () => {
    expect(formatDuration(null)).toBe('0m');
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(-10)).toBe('0m');
  });

  it('truncates seconds and preserves minutes for whole hours', () => {
    expect(formatDuration(59)).toBe('0m');
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(3599)).toBe('59m');
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(3900)).toBe('1h 5m');
  });
});

describe('groupSecondsByDay', () => {
  it('groups by the Toronto start day and accumulates durations including null', () => {
    const sessions = [
      { started_at: '2026-09-29T03:30:00Z', duration_sec: 3600 },
      { started_at: '2026-09-28T12:00:00Z', duration_sec: 120 },
      { started_at: '2026-09-28T15:00:00Z', duration_sec: null },
      { started_at: '2026-09-29T04:00:00Z', duration_sec: null },
    ];
    expect(groupSecondsByDay(sessions, ['2026-09-28', '2026-09-29', '2026-09-30'])).toEqual(
      new Map([['2026-09-28', 3720], ['2026-09-29', 0], ['2026-09-30', 0]])
    );
  });

  it('initializes empty days and retains session days outside the supplied keys', () => {
    expect(groupSecondsByDay([], ['2026-09-29'])).toEqual(new Map([['2026-09-29', 0]]));
    expect(groupSecondsByDay([{ started_at: '2026-09-28T12:00:00Z', duration_sec: 60 }], [])).toEqual(
      new Map([['2026-09-28', 60]])
    );
  });
});

describe('buildAnalyticsDays', () => {
  it('builds seven dates ending on Toronto today without mutating now', () => {
    const now = new Date('2026-09-29T12:00:00Z');
    const days = buildAnalyticsDays(now);
    expect(days.map((day) => day.key)).toEqual([
      '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26',
      '2026-09-27', '2026-09-28', '2026-09-29',
    ]);
    expect(days[0].date.toISOString()).toBe('2026-09-23T00:00:00.000Z');
    expect(days[0].label).toBe('Wed, Sep 23');
    expect(now.toISOString()).toBe('2026-09-29T12:00:00.000Z');
  });

  it('uses Toronto today when UTC is already on the next day', () => {
    const days = buildAnalyticsDays(new Date('2026-09-29T03:59:59Z'));
    expect(days).toHaveLength(7);
    expect(days[0].key).toBe('2026-09-22');
    expect(days[6].key).toBe('2026-09-28');
  });
});

describe('sumDurations', () => {
  it('sums durations with null counting as zero and handles an empty list', () => {
    expect(sumDurations([{ duration_sec: 3600 }, { duration_sec: null }, { duration_sec: 120 }])).toBe(3720);
    expect(sumDurations([])).toBe(0);
  });
});

describe('getMidnightInTimeZone', () => {
  it.each([
    ['2026-09-29', 'America/Toronto', '2026-09-29T04:00:00.000Z'],
    ['2026-03-08', 'America/Toronto', '2026-03-08T05:00:00.000Z'],
    ['2026-03-09', 'America/Toronto', '2026-03-09T04:00:00.000Z'],
    ['2026-11-01', 'America/Toronto', '2026-11-01T04:00:00.000Z'],
    ['2026-11-02', 'America/Toronto', '2026-11-02T05:00:00.000Z'],
    ['2026-09-29', 'Asia/Tokyo', '2026-09-28T15:00:00.000Z'],
    ['2026-09-29', 'UTC', '2026-09-29T00:00:00.000Z'],
    ['2026-09-29', 'invalid/timezone', '2026-09-29T04:00:00.000Z'],
  ])('converts %s in %s', (date, zone, expected) => {
    expect(getMidnightInTimeZone(new Date(date), zone).toISOString()).toBe(expected);
  });
});

describe('getTodayRangeUtc', () => {
  it.each([
    ['2026-09-29T15:00Z', 'America/Toronto', '2026-09-29T04:00:00.000Z', '2026-09-30T04:00:00.000Z', 24],
    ['2026-03-08T15:00Z', 'America/Toronto', '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z', 23],
    ['2026-11-01T15:00Z', 'America/Toronto', '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z', 25],
    ['2026-09-29T15:00Z', 'Asia/Tokyo', '2026-09-29T15:00:00.000Z', '2026-09-30T15:00:00.000Z', 24],
    ['2026-09-29T15:00Z', 'invalid/timezone', '2026-09-29T04:00:00.000Z', '2026-09-30T04:00:00.000Z', 24],
  ])('bounds %s in %s', (instant, zone, start, end, hours) => {
    const now = new Date(instant);
    const { startUtc, endUtc } = getTodayRangeUtc(now, zone);
    expect(startUtc.toISOString()).toBe(start);
    expect(endUtc.toISOString()).toBe(end);
    expect((endUtc.getTime() - startUtc.getTime()) / 3600000).toBe(hours);
    expect(now.getTime()).toBe(new Date(instant).getTime());
  });

  it('includes the entire fall-back day with an exclusive upper bound', () => {
    const { startUtc, endUtc } = getTodayRangeUtc(new Date('2026-11-01T15:00Z'), 'America/Toronto');
    const contains = (instant: string) => new Date(instant) >= startUtc && new Date(instant) < endUtc;
    // November 1 at 03:30Z is October 31 at 23:30 locally.
    expect(contains('2026-11-01T03:30Z')).toBe(false);
    expect(contains('2026-11-01T04:00Z')).toBe(true);
    expect(contains('2026-11-01T05:30Z')).toBe(true);
    expect(contains('2026-11-01T06:30Z')).toBe(true);
    expect(contains('2026-11-02T04:30Z')).toBe(true);
    expect(contains('2026-11-02T05:00Z')).toBe(false);
  });
});

describe('getDailyProgressPercent', () => {
  it.each([[45, 120, 37.5], [200, 120, 100], [30, null, null], [-10, 120, 0], [0, 120, 0]])('calculates %s / %s', (minutes, target, expected) => {
    expect(getDailyProgressPercent(minutes as number, target)).toBe(expected);
  });
});

describe('buildSkillStats', () => {
  const weekStart = getTorontoMidnight(buildAnalyticsDays(new Date('2026-09-29T12:00:00Z'))[0].date);

  it('sums durations and counts sessions separately for each skill', () => {
    expect(buildSkillStats([
      { skill_id: 'a', duration_sec: 120, started_at: '2026-09-24T12:00:00Z' },
      { skill_id: 'b', duration_sec: 60, started_at: '2026-09-24T12:00:00Z' },
      { skill_id: 'a', duration_sec: 180, started_at: '2026-09-25T12:00:00Z' }
    ], weekStart)).toEqual(new Map([
      ['a', { skillId: 'a', totalSec: 300, sessionCount: 2, weekSec: 300 }],
      ['b', { skillId: 'b', totalSec: 60, sessionCount: 1, weekSec: 60 }]
    ]));
  });

  it('includes the exact Toronto week boundary and excludes earlier starts from weekSec only', () => {
    expect(buildSkillStats([
      { skill_id: 'a', duration_sec: 120, started_at: '2026-09-23T03:59:59Z' },
      { skill_id: 'a', duration_sec: 60, started_at: '2026-09-23T00:00:00-04:00' }
    ], weekStart).get('a')).toEqual({ skillId: 'a', totalSec: 180, sessionCount: 2, weekSec: 60 });
  });

  it('ignores unlinked sessions and handles an empty list', () => {
    expect(buildSkillStats([{ skill_id: null, duration_sec: 500, started_at: '2026-09-24T12:00:00Z' }], weekStart)).toEqual(new Map());
    expect(buildSkillStats([], weekStart)).toEqual(new Map());
  });

  it('counts null durations as zero without losing the session count', () => {
    expect(buildSkillStats([{ skill_id: 'a', duration_sec: null, started_at: '2026-09-24T12:00:00Z' }], weekStart).get('a'))
      .toEqual({ skillId: 'a', totalSec: 0, sessionCount: 1, weekSec: 0 });
  });
});
