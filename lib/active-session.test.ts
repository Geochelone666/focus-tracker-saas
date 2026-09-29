import { describe, expect, it } from "vitest";
import { classifyActiveSession, formatElapsed, pickLatestActiveSession, STALE_ACTIVE_SESSION_MS } from "./active-session";

describe("classifyActiveSession", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  it.each([null, undefined, "", "invalid"])("returns none for %s", (value) => {
    expect(classifyActiveSession(value, now)).toBe("none");
  });
  it.each([
    [STALE_ACTIVE_SESSION_MS - 1, "active"],
    [STALE_ACTIVE_SESSION_MS, "active"],
    [STALE_ACTIVE_SESSION_MS + 1, "stale"],
    [-1000, "active"]
  ] as const)("classifies an age of %i ms as %s", (age, expected) => {
    expect(classifyActiveSession(new Date(now.getTime() - age).toISOString(), now)).toBe(expected);
  });
});

describe("pickLatestActiveSession", () => {
  const older = { id: "old", started_at: "2026-09-28T12:00:00Z" };
  const newer = { id: "new", started_at: "2026-09-29T12:00:00Z" };
  it("returns null for an empty array", () => expect(pickLatestActiveSession([])).toBeNull());
  it("returns the single session", () => expect(pickLatestActiveSession([older])).toBe(older));
  it("selects the latest without mutating out-of-order input", () => {
    const sessions = Object.freeze([older, newer, older]);
    expect(pickLatestActiveSession(sessions)).toBe(newer);
    expect(sessions).toEqual([older, newer, older]);
  });
  it("compares instants across timezone offsets", () => {
    const latest = { started_at: "2026-09-29T09:00:00-04:00" };
    expect(pickLatestActiveSession([newer, latest])).toBe(latest);
  });
  it("keeps the first session on ties", () => {
    expect(pickLatestActiveSession([newer, { ...newer }])).toBe(newer);
  });
});

describe("formatElapsed", () => {
  it.each([
    [0, "0:00:00"], [90000, "0:01:30"], [3661000, "1:01:01"],
    [-1000, "0:00:00"], [1999, "0:00:01"]
  ])("formats %i as %s", (ms, expected) => expect(formatElapsed(ms)).toBe(expected));
});
