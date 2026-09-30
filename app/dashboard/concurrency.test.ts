import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/validation", () => import("../../lib/validation"));
vi.mock("@/lib/active-session", () => import("../../lib/active-session"));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`Redirect: ${url}`); } }));
import { stopSession } from "./actions";

type Row = { id: string; user_id: string; started_at: string; ended_at: string | null; duration_sec: number | null; note: string | null };

describe("Stop concurrency", () => {
  let row: Row;
  let beforeWrite: (() => void) | undefined;
  let reads: Array<() => void>;
  beforeEach(() => {
    row = { id: "11111111-1111-4111-8111-111111111111", user_id: "user", started_at: new Date(Date.now() - 60000).toISOString(), ended_at: null, duration_sec: null, note: null };
    reads = [];
    beforeWrite = undefined;
    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "user" } }, error: null }) },
      from: () => {
        const predicates: Array<(value: Row) => boolean> = [];
        let changes: Partial<Row> = {};
        const query = {
          select: () => query, order: () => query, limit: () => query,
          eq: (key: keyof Row, value: unknown) => { predicates.push(r => r[key] === value); return query; },
          is: (key: keyof Row, value: unknown) => { predicates.push(r => r[key] === value); return query; },
          update: (value: Partial<Row>) => { changes = value; return query; },
          maybeSingle: () => new Promise<{ data: Row | null; error: null }>(resolve => {
            const snapshot = { ...row };
            reads.push(() => resolve({ data: predicates.every(matches => matches(snapshot)) ? snapshot : null, error: null }));
            if (reads.length === 2) reads.forEach(done => done());
          }),
          then: (resolve: (result: { error: null }) => unknown) => {
            beforeWrite?.();
            if (predicates.every(matches => matches(row))) Object.assign(row, changes);
            return Promise.resolve({ error: null }).then(resolve);
          }
        };
        return query;
      }
    });
  });
  const stop = (note: string) => { const form = new FormData(); form.set("session_id", "11111111-1111-4111-8111-111111111111"); form.set("note", note); return stopSession(form).catch(e => { expect(e.message).toBe("Redirect: /dashboard"); }); };

  it("preserves the first Stop's note when both requests read the same active row", async () => {
    await Promise.all([stop("first"), stop("second")]);
    expect(row.note).toBe("first");
    expect(row.ended_at).not.toBeNull();
  });

  it("does not stop a newer session when an old tab submits Stop", async () => {
    row.id = "22222222-2222-4222-8222-222222222222";
    await Promise.all([stop("stale form"), stop("repeated stale form")]);
    expect(row).toMatchObject({ ended_at: null, duration_sec: null, note: null });
  });

  it("does not stop a session resumed after Stop read its previous start time", async () => {
    const resumedAt = new Date().toISOString();
    beforeWrite = () => { row.started_at = resumedAt; };
    await Promise.all([stop("old request"), stop("another old request")]);
    expect(row).toMatchObject({ started_at: resumedAt, ended_at: null, duration_sec: null, note: null });
  });
});
