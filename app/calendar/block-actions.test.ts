import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/planning-data", () => ({ planningContext: mocks.context }));
vi.mock("@/lib/planning", () => import("../../lib/planning"));
vi.mock("@/lib/calendar", () => import("../../lib/calendar"));
vi.mock("@/lib/validation", () => import("../../lib/validation"));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveTimeBlock } from "./block-actions";

const id = "11111111-1111-4111-8111-111111111111";
const revision = "2026-10-20T12:00:00.123456Z";
function request(fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    id, expected_updated_at: revision, date: "2026-11-02",
    time: "14:00", minutes: "90", ...fields
  })) form.set(key, value);
  return form;
}
describe("F2-Q02: keyboard/mobile block save action boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: 1, error: null });
    mocks.context.mockResolvedValue({ supabase: { rpc: mocks.rpc }, user: { id: "owner" } });
  });
  it("preserves the complete microsecond revision and changes only scheduling fields", async () => {
    const result = await saveTimeBlock({}, request({ scope: "future", series_revisions: "{}" }));
    expect(result.success).toMatch(/saved/i);
    expect(mocks.rpc).toHaveBeenCalledWith("mutate_schedule", {
      p_id: id, p_expected: revision, p_patch: {
        scheduled_date: "2026-11-02", scheduled_time: "14:00", estimated_minutes: 90
      }, p_future: true, p_revisions: {}
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/calendar");
  });
  it.each([
    ["missing version", { expected_updated_at: "" }],
    ["invalid date", { date: "2026-02-29" }],
    ["time without date", { date: "" }],
    ["invalid hour", { time: "24:00" }],
    ["zero minutes", { minutes: "0" }],
    ["fractional minutes", { minutes: "1.5" }],
    ["too long", { minutes: "1441" }],
    ["forged id", { id: "not-a-uuid" }],
    ["invalid series revision JSON", { series_revisions: "{" }],
  ])("rejects %s before authentication or writes", async (_label, fields) => {
    const result = await saveTimeBlock({}, request(fields));
    expect(result.error).toBeTruthy();
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("keeps revision failures recoverable and does not present a success", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001" } });
    const result = await saveTimeBlock({}, request());
    expect(result.error).toMatch(/another device/);
    expect(result.success).toBeUndefined();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("reports a network failure without treating a task as saved", async () => {
    mocks.rpc.mockRejectedValue(new Error("offline"));
    const result = await saveTimeBlock({}, request());
    expect(result.error).toMatch(/input is kept/);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("allows moving an existing task back to Inbox without clearing its deadline", async () => {
    const result = await saveTimeBlock({}, request({ date: "", time: "", minutes: "" }));
    expect(result.success).toMatch(/Inbox/);
    expect(mocks.rpc).toHaveBeenCalledWith("mutate_schedule", expect.objectContaining({
      p_patch: { scheduled_date: null, scheduled_time: null, estimated_minutes: null }
    }));
  });
});
