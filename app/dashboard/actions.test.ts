import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("@/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/validation", () => import("../../lib/validation"));
vi.mock("@/lib/active-session", () => import("../../lib/active-session"));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`Redirect: ${url}`); }
}));

import { cleanupDuplicateActiveSessions, discardStaleSession, resumeStaleSession, startSession, stopSession } from "./actions";

describe("stopSession notes", () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
    update: vi.fn().mockReturnThis()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    query.maybeSingle.mockResolvedValue({
      data: { id: "session-1", started_at: new Date(Date.now() - 60000).toISOString() },
      error: null
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from: vi.fn().mockReturnValue(query)
    });
  });

  it.each([
    ["  deep work  ", "deep work"],
    ["", null],
    ["   ", null],
    [null, null],
    ["a".repeat(200), "a".repeat(200)]
  ])("stores the validated note for %j", async (input, expected) => {
    const form = new FormData();
    if (input !== null) form.set("note", input);

    await expect(stopSession(form)).rejects.toThrow("Redirect: /dashboard");

    expect(query.update).toHaveBeenCalledWith({
      note: expected,
      ended_at: expect.any(String),
      duration_sec: expect.any(Number)
    });
    expect(query.eq).toHaveBeenCalledWith("id", "session-1");
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it.each(["too long", "file"])("rejects a %s note before writing", async (kind) => {
    const form = new FormData();
    form.set("note", kind === "file" ? new Blob(["note"]) : "a".repeat(201));

    await expect(stopSession(form)).rejects.toThrow(
      "Redirect: /dashboard?error=" + encodeURIComponent("Please enter a note of 200 characters or fewer.")
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(query.update).not.toHaveBeenCalled();
  });
});

describe("active session persistence", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  const stale = { id: "session-1", started_at: "2026-09-26T12:00:00Z" };
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn(),
    update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
    insert: vi.fn(), then: vi.fn()
  };
  let result: { data: typeof stale[] | null; error: { message: string } | null };

  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of [query.select, query.eq, query.is, query.order, query.limit, query.update, query.delete]) {
      method.mockReturnThis();
    }
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.spyOn(console, "error").mockImplementation(() => {});
    result = { data: null, error: null };
    query.then.mockImplementation((resolve) => Promise.resolve(result).then(resolve));
    query.maybeSingle.mockResolvedValue({ data: stale, error: null });
    query.insert.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from: vi.fn().mockReturnValue(query)
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("resumes the stale row from now and revalidates", async () => {
    await expect(resumeStaleSession()).rejects.toThrow(/^Redirect: \/dashboard$/);
    expect(query.update).toHaveBeenCalledWith({ started_at: now.toISOString() });
    expect(query.eq).toHaveBeenCalledWith("id", stale.id);
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(query.eq).toHaveBeenCalledWith("started_at", stale.started_at);
    expect(query.is).toHaveBeenCalledWith("ended_at", null);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("discards only the user's still-active stale row", async () => {
    await expect(discardStaleSession()).rejects.toThrow(/^Redirect: \/dashboard$/);
    expect(query.delete).toHaveBeenCalledOnce();
    expect(query.eq).toHaveBeenCalledWith("id", stale.id);
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(query.eq).toHaveBeenCalledWith("started_at", stale.started_at);
    expect(query.is).toHaveBeenCalledWith("ended_at", null);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it.each([resumeStaleSession, discardStaleSession])("does not change a session already resumed by another tab", async (action) => {
    query.maybeSingle.mockResolvedValue({ data: { ...stale, started_at: now.toISOString() }, error: null });
    await expect(action()).rejects.toThrow(/^Redirect: \/dashboard$/);
    expect(query.update).not.toHaveBeenCalled();
    expect(query.delete).not.toHaveBeenCalled();
  });

  it.each([resumeStaleSession, discardStaleSession])("does nothing when there is no active session", async (action) => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(action()).rejects.toThrow(/^Redirect: \/dashboard$/);
    expect(query.update).not.toHaveBeenCalled();
    expect(query.delete).not.toHaveBeenCalled();
  });

  it("redirects a unique violation to a friendly error", async () => {
    query.insert.mockResolvedValue({ error: { code: "23505" } });
    await expect(startSession()).rejects.toThrow(
      "Redirect: /dashboard?error=" + encodeURIComponent("A session is already running.")
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps the ordinary start error for other failures", async () => {
    query.insert.mockResolvedValue({ error: { code: "42501" } });
    await expect(startSession()).rejects.toThrow(
      "Redirect: /dashboard?error=" + encodeURIComponent("Couldn't start the session. Please try again.")
    );
  });

  it("ends duplicates at their own start with zero duration and keeps the latest", async () => {
    const latest = { id: "latest", started_at: now.toISOString() };
    const oldest = { id: "oldest", started_at: "2026-09-25T12:00:00Z" };
    result = { data: [latest, stale, oldest], error: null };
    await cleanupDuplicateActiveSessions();
    expect(query.update.mock.calls).toEqual([
      [{ ended_at: stale.started_at, duration_sec: 0 }],
      [{ ended_at: oldest.started_at, duration_sec: 0 }]
    ]);
    expect(query.eq).not.toHaveBeenCalledWith("id", latest.id);
    expect(query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(query.is).toHaveBeenCalledWith("ended_at", null);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([{ sessions: [] }, { sessions: [stale] }])("does not write when cleanup is unnecessary: $sessions", async ({ sessions }) => {
    result = { data: sessions, error: null };
    await cleanupDuplicateActiveSessions();
    expect(query.update).not.toHaveBeenCalled();
  });

  it("redirects cleanup read failures without writing", async () => {
    result = { data: null, error: { message: "Unavailable" } };
    await expect(cleanupDuplicateActiveSessions()).rejects.toThrow(
      "Redirect: /dashboard?error=" + encodeURIComponent("Couldn't recover the running session. Please try again.")
    );
    expect(query.update).not.toHaveBeenCalled();
  });
});
