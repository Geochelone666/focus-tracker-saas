import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/session-csv", () => import("../../../lib/session-csv"));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`Redirect: ${url}`); }
}));

import { GET } from "./route";

describe("session CSV export", () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn()
  };
  const from = vi.fn().mockReturnValue(query);
  const getUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    query.range.mockReset().mockResolvedValue({ data: [], error: null });
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.createClient.mockResolvedValue({ auth: { getUser }, from });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T13:02:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("redirects anonymous users without reading sessions", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(GET()).rejects.toThrow("Redirect: /login");
    expect(from).not.toHaveBeenCalled();
  });

  it("downloads every batch for the signed-in user, newest first", async () => {
    const session = { started_at: "2026-09-29T13:00:00Z", ended_at: null, note: null };
    query.range
      .mockResolvedValueOnce({ data: Array(1000).fill(session), error: null })
      .mockResolvedValueOnce({ data: [{ ...session, note: "last batch" }], error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="focus-sessions-2026-09-29.csv"');
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const csv = await response.text();
    expect(csv.trim().split("\r\n")).toHaveLength(1002);
    expect(csv).toContain('"120","active","last batch"');
    expect(from).toHaveBeenCalledWith("focus_sessions");
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(query.order).toHaveBeenCalledWith("started_at", { ascending: false });
    expect(query.order).toHaveBeenCalledWith("id", { ascending: false });
    expect(query.range.mock.calls).toEqual([[0, 999], [1000, 1999], [1001, 2000]]);
  });

  it("returns a header-only download for empty history", async () => {
    const response = await GET();
    expect(await response.text()).toBe('"started_at","ended_at","duration_seconds","status","note"\r\n');
  });

  it("does not return a partial download when a later batch fails", async () => {
    query.range
      .mockResolvedValueOnce({ data: [{ started_at: "2026-09-29T13:00:00Z", ended_at: null, note: null }], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "database detail" } });
    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(await response.text()).not.toContain("database detail");
  });
});
