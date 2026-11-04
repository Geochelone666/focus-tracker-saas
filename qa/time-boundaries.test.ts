import { describe, expect, it } from "vitest";
import { dayBlockLayout, conflictingTasks, taskInterval, wallTimeInstants } from "../lib/time-blocks";
import { addDays, type Schedule } from "../lib/planning";

function task(id: string, day: string, time: string, minutes: number): Schedule {
  return {
    id, title: id, scheduled_date: day, scheduled_time: time, estimated_minutes: minutes,
    is_done: false, priority: "normal", deleted_at: null, notes: null, energy: null,
    project_id: null, skill_id: null, series_id: null, deferral_reason: null,
  };
}
describe("F2-Q02: calendar temporal boundary regressions", () => {
  it("resolves Toronto DST gaps/folds by real instants, never inventing nonexistent 02:30", () => {
    expect(wallTimeInstants("2026-03-08", "02:30", "America/Toronto")).toEqual([]);
    expect(wallTimeInstants("2026-11-01", "01:30", "America/Toronto")).toEqual([
      Date.parse("2026-11-01T05:30:00Z"), Date.parse("2026-11-01T06:30:00Z"),
    ]);
    const fold = task("fold", "2026-11-01", "01:30", 30);
    expect(taskInterval(fold, "America/Toronto")).toMatchObject({
      start: Date.parse("2026-11-01T06:30:00Z"),
      end: Date.parse("2026-11-01T07:00:00Z"),
      ambiguous: true,
    });
  });
  it("keeps elapsed duration across the spring 23-hour day and autumn 25-hour day", () => {
    for (const [day, time] of [["2026-03-08", "01:30"], ["2026-11-01", "01:30"]] as const) {
      const interval = taskInterval(task(day, day, time, 90), "America/Toronto")!;
      expect(interval.end - interval.start).toBe(90 * 60000);
      expect(dayBlockLayout([task(day, day, time, 90)], day, "America/Toronto").dst).toBe(true);
    }
    expect(dayBlockLayout([], "2026-11-02", "America/Toronto").dst).toBe(false);
  });
  it("honors distinct timezone offsets and half-hour zones", () => {
    const a = task("same-wall", "2026-11-02", "09:00", 60);
    const toronto = taskInterval(a, "America/Toronto")!;
    const tokyo = taskInterval(a, "Asia/Tokyo")!;
    const kolkata = taskInterval(a, "Asia/Kolkata")!;
    expect(toronto.start).toBe(Date.parse("2026-11-02T14:00Z"));
    expect(tokyo.start).toBe(Date.parse("2026-11-02T00:00Z"));
    expect(kolkata.start).toBe(Date.parse("2026-11-02T03:30Z"));
  });
  it("splits overnight tasks and preserves the next calendar date without a duplicate instance", () => {
    const night = task("overnight", "2026-12-31", "23:30", 90);
    const first = dayBlockLayout([night], "2026-12-31", "UTC");
    const next = dayBlockLayout([night], "2027-01-01", "UTC");
    expect(first.segments).toHaveLength(1);
    expect(first.segments[0]).toMatchObject({ carries: true, continued: false });
    expect(next.segments).toHaveLength(1);
    expect(next.segments[0]).toMatchObject({ carries: false, continued: true });
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("treats touching endpoints as non-overlapping but detects a one-minute intrusion", () => {
    const a = task("a", "2026-10-24", "14:00", 90);
    const adjacent = task("adjacent", "2026-10-24", "15:30", 30);
    const intruder = task("intruder", "2026-10-24", "15:29", 30);
    expect(conflictingTasks(a, [a, adjacent], "UTC")).toEqual([]);
    expect(conflictingTasks(a, [a, intruder], "UTC").map(t => t.id)).toEqual(["intruder"]);
  });
  it("rejects invalid dates/times and leaves unscheduled or unestimated tasks outside occupancy", () => {
    expect(wallTimeInstants("2026-02-29", "10:00", "UTC")).toEqual([]);
    expect(wallTimeInstants("2026-11-02", "24:00", "UTC")).toEqual([]);
    expect(taskInterval({ ...task("inbox", "2026-11-02", "09:00", 60), scheduled_date: null }, "UTC")).toBeNull();
    expect(taskInterval({ ...task("unknown", "2026-11-02", "09:00", 60), estimated_minutes: null }, "UTC")).toBeNull();
  });
});
