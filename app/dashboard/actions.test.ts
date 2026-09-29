import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("@/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/validation", () => import("../../lib/validation"));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`Redirect: ${url}`); }
}));

import { stopSession } from "./actions";

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
