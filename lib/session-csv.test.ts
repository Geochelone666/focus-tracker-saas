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

  it.each(["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\tTab"])("neutralizes formula-like note %j", (note) => {
    const csv = buildSessionCsv([{ started_at: "2026-09-29T13:00:00Z", ended_at: "2026-09-29T13:00:00Z", note }]);
    expect(csv.split("\r\n")[1].endsWith(`"'${note.replace(/"/g, '""')}"`)).toBe(true);
  });

  it("leaves ordinary notes unchanged", () => {
    expect(buildSessionCsv([{ started_at: "2026-09-29T13:00:00Z", ended_at: "2026-09-29T13:00:00Z", note: "Deep work - 2h" }]))
      .toContain('"Deep work - 2h"');
  });
});


describe("effective focus CSV",()=>{
 it("uses stored focus rather than wall time including pause",()=>{
  expect(buildSessionCsv([{started_at:"2026-10-24T12:00:00Z",ended_at:"2026-10-24T12:11:00Z",duration_sec:60,focus_status:"completed",note:"done"}])).toContain('"60","completed"');
 });
 it("never exports break duration as focus",()=>{
  expect(buildSessionCsv([{started_at:"2026-10-24T12:00:00Z",ended_at:"2026-10-24T12:05:00Z",duration_sec:0,session_kind:"short_break",focus_status:"completed",note:null}])).toContain('"0","completed"');
 });
});
