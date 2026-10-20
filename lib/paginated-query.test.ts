import { describe, expect, it, vi } from "vitest";
import { readAllRows } from "./paginated-query";
import { buildSkillStats, sumDurations } from "./analytics";

describe("complete statistics", () => {
  it.each([0, 999, 1000, 1001, 2001])("includes all %i sessions in skill and dashboard totals", async (count) => {
    const sessions = Array.from({ length: count }, () => ({
      skill_id: "skill", started_at: "2026-09-29T12:00:00Z", duration_sec: 60
    }));
    const rows = await readAllRows(async (from, to) => ({ data: sessions.slice(from, to + 1), error: null }));
    expect(sumDurations(rows)).toBe(count * 60);
    if (count) expect(buildSkillStats(rows, new Date("2026-09-29T04:00:00Z")).get("skill"))
      .toMatchObject({ totalSec: count * 60, sessionCount: count, weekSec: count * 60 });
  });

  it("continues when the database caps pages below the requested size", async () => {
    const data = Array.from({ length: 1100 }, (_, id) => ({ id }));
    const rows = await readAllRows(async (from, to) => ({ data: data.slice(from, Math.min(to + 1, from + 250)), error: null }));
    expect(rows).toEqual(data);
  });

  it("fails instead of displaying a partial total when a later page fails", async () => {
    const failure = { message: "Database unavailable" };
    const fetchPage = vi.fn().mockResolvedValueOnce({ data: Array(1000).fill({ duration_sec: 60 }), error: null })
      .mockResolvedValueOnce({ data: null, error: failure });
    await expect(readAllRows(fetchPage)).rejects.toEqual(failure);
  });
});
