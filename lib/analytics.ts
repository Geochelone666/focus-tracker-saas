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

const timeZoneOffsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ANALYTICS_TIME_ZONE,
  timeZoneName: "longOffset"
});

export function getDateKey(date: Date) {
  const parts = analyticsDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export function getTorontoMidnight(date: Date) {
  const utcMidnight = date.getTime();
  const offsetPart = timeZoneOffsetFormatter
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = offsetPart?.match(/GMT([+-])(\d{2}):(\d{2})/);

  if (!match) {
    throw new Error("Could not determine the America/Toronto UTC offset.");
  }

  const direction = match[1] === "+" ? 1 : -1;
  const offsetMinutes = direction * (Number(match[2]) * 60 + Number(match[3]));

  return new Date(utcMidnight - offsetMinutes * 60 * 1000);
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
