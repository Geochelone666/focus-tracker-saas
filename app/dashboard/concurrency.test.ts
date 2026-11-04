import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/validation", () => import("../../lib/validation"));
vi.mock("@/lib/active-session", () => import("../../lib/active-session"));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`Redirect: ${url}`); } }));
import { stopSession } from "./actions";

type Row = { id: string; user_id: string; started_at: string; ended_at: string | null; duration_sec: number | null; note: string | null; focus_revision: number };

describe("Stop concurrency via revision-checked RPC", () => {
  let row: Row;
  let beforeWrite: (() => void) | undefined;
  let reads: Array<() => void>;
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    row = { id: "11111111-1111-4111-8111-111111111111", user_id: "user", started_at: new Date(Date.now() - 60000).toISOString(), ended_at: null, duration_sec: null, note: null, focus_revision: 0 };
    reads = [];
    beforeWrite = undefined;
    rpc = vi.fn(async (_operation: string, p: { p_id: string; p_revision: number; p_note: string | null }) => {
      if(beforeWrite){const action=beforeWrite;beforeWrite=undefined;action();}
      if(row.id !== p.p_id) return {data:null,error:{code:"42501"}};
      if(row.ended_at !== null) return {data:{...row},error:null}; // repeated complete is idempotent
      if(row.focus_revision !== p.p_revision) return {data:null,error:{code:"40001"}};
      row.ended_at = new Date().toISOString();
      row.duration_sec = 60;
      row.note = p.p_note;
      row.focus_revision += 1;
      return {data:{...row},error:null};
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) },
      rpc,
      from: () => {
        const predicates: Array<(value: Row) => boolean> = [];
        const query = {
          select: () => query, order: () => query, limit: () => query,
          eq: (key: keyof Row, value: unknown) => { predicates.push(r => r[key] === value); return query; },
          is: (key: keyof Row, value: unknown) => { predicates.push(r => r[key] === value); return query; },
          maybeSingle: () => new Promise<{ data: Row | null; error: null }>(resolve => {
            const snapshot = { ...row };
            reads.push(() => resolve({ data: predicates.every(matches => matches(snapshot)) ? snapshot : null, error: null }));
            if(reads.length === 2) reads.forEach(done => done());
          })
        };
        return query;
      }
    });
  });

  const stop = (note: string) => {
    const form = new FormData();
    form.set("session_id", "11111111-1111-4111-8111-111111111111");
    form.set("note", note);
    return stopSession(form).catch(error => {
      expect(error.message).toMatch(/^Redirect: \/dashboard/);
    });
  };

  it("keeps the first Stop note when two clients read the same revision", async () => {
    await Promise.all([stop("first"), stop("second")]);
    expect(row.note).toBe("first");
    expect(row.ended_at).not.toBeNull();
    expect(row.focus_revision).toBe(1);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("never stops a different session after a stale form is submitted", async () => {
    row.id = "22222222-2222-4222-8222-222222222222";
    await Promise.all([stop("stale form"), stop("repeated stale form")]);
    expect(row).toMatchObject({ ended_at: null, duration_sec: null, note: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a Stop after another device changes the session revision", async () => {
    const resumedAt = new Date().toISOString();
    beforeWrite = () => { row.started_at = resumedAt; row.focus_revision += 1; };
    await Promise.all([stop("old request"), stop("another old request")]);
    expect(row).toMatchObject({ started_at: resumedAt, ended_at: null, duration_sec: null, note: null });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
