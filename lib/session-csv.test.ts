import { describe, expect, it } from "vitest";
import { buildSessionCsv } from "./session-csv";

const header = '"started_at","ended_at","duration_seconds","status","note"\r\n';

describe("buildSessionCsv", () => {
  it("exports the columns even with no sessions", () => {
    expect(buildSessionCsv([])).toBe(header);
  });

  it("normalizes timestamps to UTC and escapes commas, quotes and newlines", () => {
    expect(buildSessionCsv([{
      started_at: "2026-09-29T09:00:00-04:00",
      ended_at: "2026-09-29T09:01:01.900-04:00",
      note: 'Read, "think"\r\nÉcrire'
    }])).toBe(header + '"2026-09-29T13:00:00.000Z","2026-09-29T13:01:01.900Z","61","ended","Read, ""think""\r\nÉcrire"\r\n');
  });

  it("exports active sessions with blank end/note and elapsed integer seconds", () => {
    expect(buildSessionCsv([{
      started_at: "2026-09-29T13:00:00Z", ended_at: null, note: null
    }], Date.parse("2026-09-29T13:02:00.900Z"))).toBe(
      header + '"2026-09-29T13:00:00.000Z","","120","active",""\r\n'
    );
  });

  it("clamps duration to zero for a start later than the export time", () => {
    expect(buildSessionCsv([{
      started_at: "2026-09-29T13:00:00Z", ended_at: null, note: ""
    }], 0)).toContain('"0","active",""');
  });
});
