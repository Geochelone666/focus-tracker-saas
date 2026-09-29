export type SessionDurationRow = {
  started_at: string;
  duration_sec: number | null;
};

const ANALYTICS_TIME_ZONE = "America/Toronto";

const analyticsDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ANALYTICS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function validTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return ANALYTICS_TIME_ZONE;
  }
}

export function getDateKey(date: Date) {
  const parts = analyticsDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

/** Interpret the UTC calendar fields of date as a local calendar date. */
export function getMidnightInTimeZone(date: Date, timeZone: string): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: validTimeZone(timeZone),
    timeZoneName: "longOffset"
  });
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  let midnight = utcMidnight;
  // Re-evaluate at the candidate instant: its offset can differ from UTC midnight.
  for (let attempt = 0; attempt < 3; attempt++) {
    const offset = formatter.formatToParts(new Date(midnight))
      .find((part) => part.type === "timeZoneName")?.value;
    const match = offset?.match(/GMT([+-])(\d{2}):(\d{2})/);
    const minutes = match
      ? (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3]))
      : 0;
    const candidate = utcMidnight - minutes * 60 * 1000;
    if (candidate === midnight) break;
    midnight = candidate;
  }
  return new Date(midnight);
}

export function getTorontoMidnight(date: Date): Date {
  return getMidnightInTimeZone(date, ANALYTICS_TIME_ZONE);
}

export function getTodayRangeUtc(now: Date, timeZone: string): { startUtc: Date; endUtc: Date } {
  const zone = validTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((value) => value.type === type)?.value);
  const today = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return {
    startUtc: getMidnightInTimeZone(today, zone),
    endUtc: getMidnightInTimeZone(tomorrow, zone)
  };
}

export function getDailyProgressPercent(todayMinutes: number, targetMinutes: number | null): number | null {
  return targetMinutes === null ? null : Math.min(100, Math.max(0, todayMinutes / targetMinutes * 100));
}

export function formatDuration(totalSeconds: number | null) {
  if (!totalSeconds || totalSeconds <= 0) {
    return "0m";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

export function buildAnalyticsDays(now: Date): Array<{ date: Date; key: string; label: string }> {
  const todayKey = getDateKey(now);
  const [year, month, day] = todayKey.split("-").map(Number);
  const today = new Date(Date.UTC(year, month - 1, day));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (6 - index));

    return {
      date,
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("en-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC"
      })
    };
  });
}

export function groupSecondsByDay(sessions: SessionDurationRow[], dayKeys: string[]): Map<string, number> {
  const secondsByDay = new Map(dayKeys.map((key) => [key, 0]));
  sessions.forEach((session) => {
    const dateKey = getDateKey(new Date(session.started_at));
    secondsByDay.set(dateKey, (secondsByDay.get(dateKey) ?? 0) + (session.duration_sec ?? 0));
  });
  return secondsByDay;
}

export function sumDurations(sessions: Array<{ duration_sec: number | null }>): number {
  return sessions.reduce((sum, row) => sum + (row.duration_sec ?? 0), 0);
}

export type SkillSessionRow = {
  skill_id: string | null;
  duration_sec: number | null;
  started_at: string;
};

export type SkillStat = {
  skillId: string;
  totalSec: number;
  sessionCount: number;
  weekSec: number;
};

export function buildSkillStats(sessions: SkillSessionRow[], weekStart: Date): Map<string, SkillStat> {
  const stats = new Map<string, SkillStat>();
  for (const session of sessions) {
    if (session.skill_id === null) continue;
    const stat = stats.get(session.skill_id) ?? {
      skillId: session.skill_id,
      totalSec: 0,
      sessionCount: 0,
      weekSec: 0
    };
    const duration = session.duration_sec ?? 0;
    stat.totalSec += duration;
    stat.sessionCount += 1;
    if (new Date(session.started_at).getTime() >= weekStart.getTime()) {
      stat.weekSec += duration;
    }
    stats.set(session.skill_id, stat);
  }
  return stats;
}
