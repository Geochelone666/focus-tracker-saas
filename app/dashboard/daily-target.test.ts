import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), revalidatePath: vi.fn(), upsert: vi.fn() }));
vi.mock("@/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/validation", () => import("../../lib/validation"));
vi.mock("@/lib/active-session", () => import("../../lib/active-session"));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`Redirect: ${url}`); } }));
import { updateDailyTarget } from "./actions";

describe("updateDailyTarget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
      from: vi.fn((table) => { expect(table).toBe("profiles"); return { upsert: mocks.upsert }; })
    });
  });

  it.each([["120", 120], ["", null]])("saves or clears %j for the authenticated user", async (value, expected) => {
    const form = new FormData();
    form.set("target_minutes", value as string);
    await expect(updateDailyTarget(form)).rejects.toThrow(/^Redirect: \/dashboard$/);
    expect(mocks.upsert).toHaveBeenCalledWith({
      user_id: "user-1", daily_focus_target_minutes: expected, updated_at: expect.any(String)
    }, { onConflict: "user_id" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects validation failures without writing", async () => {
    const form = new FormData();
    form.set("target_minutes", "12.5");
    await expect(updateDailyTarget(form)).rejects.toThrow("Redirect: /dashboard?error=" + encodeURIComponent("Daily target must be a whole number between 1 and 1440 minutes"));
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users without writing", async () => {
    mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) } });
    await expect(updateDailyTarget(new FormData())).rejects.toThrow("Redirect: /login");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("shows a friendly error when saving fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.upsert.mockResolvedValue({ error: { message: "database unavailable" } });
      await expect(updateDailyTarget(new FormData())).rejects.toThrow("Redirect: /dashboard?error=" + encodeURIComponent("Couldn't update the daily target. Please try again."));
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
