import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  getUser: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  eq: vi.fn(),
  from: vi.fn()
}));
vi.mock("@/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/validation", () => import("../../lib/validation"));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error("Redirect: " + url); }
}));

import { addSkill, deleteSkill, toggleSkill } from "./actions";

const id = "11111111-1111-4111-8111-111111111111";
const form = (name: unknown) => {
  const data = new FormData();
  if (typeof name === "string") data.set("name", name);
  return data;
};

describe("skill actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.eq.mockReturnValueOnce({ eq: mocks.eq }).mockResolvedValue({ error: null });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.del.mockReturnValue({ eq: mocks.eq });
    mocks.from.mockReturnValue({ insert: mocks.insert, update: mocks.update, delete: mocks.del });
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: mocks.from });
  });

  it("adds a trimmed skill for the signed-in user", async () => {
    await addSkill(form("  Rust  "));
    expect(mocks.from).toHaveBeenCalledWith("skills");
    expect(mocks.insert).toHaveBeenCalledWith({ user_id: "owner", name: "Rust" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/skills");
  });

  it.each([["missing", undefined], ["blank", "   "], ["too long", "x".repeat(61)]])(
    "rejects a %s name before touching the database",
    async (_label, name) => {
      await expect(addSkill(form(name))).rejects.toThrow("Redirect: /skills?error=");
      expect(mocks.createClient).not.toHaveBeenCalled();
    }
  );

  it("redirects anonymous users to login", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(addSkill(form("Go"))).rejects.toThrow("Redirect: /login");
    await expect(toggleSkill(id, true)).rejects.toThrow("Redirect: /login");
    await expect(deleteSkill(id)).rejects.toThrow("Redirect: /login");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("reports authentication failures without exposing details", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("jwt secret detail") });
    await expect(addSkill(form("Go"))).rejects.toThrow(/Redirect: \/skills\?error=Couldn/);
    await expect(addSkill(form("Go"))).rejects.not.toThrow(/secret/);
  });

  it("reports database errors on insert", async () => {
    mocks.insert.mockResolvedValue({ error: { message: "duplicate" } });
    await expect(addSkill(form("Go"))).rejects.toThrow("Redirect: /skills?error=" + encodeURIComponent("Couldn't save your skill. Please try again."));
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([true, false])("toggles completion to %s scoped to the owner", async (done) => {
    await toggleSkill(id, done);
    expect(mocks.update).toHaveBeenCalledWith({ is_done: done, updated_at: expect.any(String) });
    expect(mocks.eq).toHaveBeenNthCalledWith(1, "id", id);
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "user_id", "owner");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/skills");
  });

  it("deletes only the owner's skill", async () => {
    await deleteSkill(id);
    expect(mocks.del).toHaveBeenCalled();
    expect(mocks.eq).toHaveBeenNthCalledWith(1, "id", id);
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "user_id", "owner");
  });

  it.each([["toggle", () => toggleSkill("not-a-uuid", true)], ["delete", () => deleteSkill("not-a-uuid")]])(
    "rejects malformed ids on %s",
    async (_label, run) => {
      await expect(run()).rejects.toThrow("Redirect: /skills?error=");
      expect(mocks.createClient).not.toHaveBeenCalled();
    }
  );

  it.each([["toggle", () => toggleSkill(id, true)], ["delete", () => deleteSkill(id)]])(
    "reports database errors on %s",
    async (_label, run) => {
      mocks.eq.mockReset().mockReturnValueOnce({ eq: mocks.eq }).mockResolvedValue({ error: { message: "rls" } });
      await expect(run()).rejects.toThrow("Redirect: /skills?error=");
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    }
  );
});
