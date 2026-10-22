import { describe, expect, it } from "vitest";
import { buildAnalyticsDays, getDateKey, getMidnightInTimeZone, getTodayRangeUtc } from "./analytics";
import { addDays } from "./planning";

// Zones with half/quarter-hour offsets, 30-minute DST, midnight DST transitions
// and date-line jumps, each sampled on or near a transition day.
const cases: Array<[string, string]> = [
  ["Asia/Kolkata", "2026-10-22T12:00:00Z"],
  ["Asia/Kathmandu", "2026-10-22T12:00:00Z"],
  ["America/St_Johns", "2026-11-01T12:00:00Z"],
  ["America/St_Johns", "2026-03-08T12:00:00Z"],
  ["Pacific/Chatham", "2026-04-05T12:00:00Z"],
  ["Australia/Lord_Howe", "2026-10-04T12:00:00Z"],
  ["America/Havana", "2026-03-08T12:00:00Z"],
  ["America/Havana", "2026-11-01T12:00:00Z"],
  ["America/Asuncion", "2026-10-04T12:00:00Z"],
  ["America/Santiago", "2026-09-06T12:00:00Z"],
  ["Asia/Beirut", "2026-03-29T12:00:00Z"],
  ["Pacific/Kiritimati", "2026-10-22T12:00:00Z"],
  ["Pacific/Pago_Pago", "2026-10-22T12:00:00Z"],
  ["America/Toronto", "2026-03-08T12:00:00Z"],
  ["America/Toronto", "2026-11-01T12:00:00Z"],
  ["UTC", "2026-10-22T00:00:00Z"],
];

describe.each(cases)("today range in %s around %s", (zone, instant) => {
  const now = new Date(instant);
  const today = getDateKey(now, zone);
  const { startUtc, endUtc } = getTodayRangeUtc(now, zone);

  it("starts exactly at local midnight and ends at the next one", () => {
    expect(getDateKey(startUtc, zone)).toBe(today);
    expect(getDateKey(new Date(startUtc.getTime() - 1), zone)).toBe(addDays(today, -1));
    expect(getDateKey(new Date(endUtc.getTime() - 1), zone)).toBe(today);
    expect(getDateKey(endUtc, zone)).toBe(addDays(today, 1));
    expect(now.getTime()).toBeGreaterThanOrEqual(startUtc.getTime());
    expect(now.getTime()).toBeLessThan(endUtc.getTime());
  });

  it("builds seven consecutive local days ending today", () => {
    const days = buildAnalyticsDays(now, zone);
    expect(days.map((d) => d.key)).toEqual(Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)));
    const weekStart = getMidnightInTimeZone(days[0]!.date, zone);
    expect(getDateKey(weekStart, zone)).toBe(days[0]!.key);
    expect(getDateKey(new Date(weekStart.getTime() - 1), zone)).toBe(addDays(days[0]!.key, -1));
  });
});

describe("invalid time zones", () => {
  it("fall back to America/Toronto instead of throwing", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    expect(getTodayRangeUtc(now, "Mars/Olympus")).toEqual(getTodayRangeUtc(now, "America/Toronto"));
    expect(getDateKey(now, "not a zone")).toBe(getDateKey(now, "America/Toronto"));
  });
});
