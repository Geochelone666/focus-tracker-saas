import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

// A disposable SQL/role fixture: this is NOT a real GoTrue or PostgREST acceptance test.
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const ownTask = "11111111-1111-4111-8111-111111111111";
const foreignTask = "22222222-2222-4222-8222-222222222222";
let db: PGlite;

async function rejectAndRecover(sql: string, params: unknown[], expected: RegExp) {
  // A real Postgres error aborts a transaction until ROLLBACK TO SAVEPOINT.
  await db.exec("savepoint qa_rejected");
  let failure: unknown;
  try { await db.query(sql, params); } catch (error) { failure = error; }
  await db.exec("rollback to savepoint qa_rejected");
  await db.exec("release savepoint qa_rejected");
  expect(failure, "Unsafe mutation unexpectedly succeeded").toBeInstanceOf(Error);
  expect(String(failure)).toMatch(expected);
}

async function setIdentity(id: string) {
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id]);
}
async function revision(id: string) {
  const result = await db.query<{ stamp: string }>(
    "select updated_at::text as stamp from public.schedules where id=$1", [id]);
  return result.rows[0].stamp;
}
async function mutate(id: string, stamp: string | null, patch: object, future = false, versions: object = {}) {
  return db.query(
    "select public.mutate_schedule($1::uuid,$2::timestamptz,$3::jsonb,$4::boolean,$5::jsonb) as count",
    [id, stamp, JSON.stringify(patch), future, JSON.stringify(versions)]);
}
describe("F2-Q02: owner-scoped write and transaction regressions (PGlite)", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
    const folder = join(process.cwd(), "supabase", "migrations");
    for (const name of (await readdir(folder)).filter(file => file.endsWith(".sql")).sort()) {
      const sql = (await readFile(join(folder, name), "utf8"))
        .replace(/create extension if not exists pgcrypto;/i, "");
      await db.exec(sql);
    }
    await db.query("insert into auth.users(id,email) values($1,'qa-a@example.invalid'),($2,'qa-b@example.invalid')", [owner, other]);
  }, 120_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec("begin");
    await db.query("insert into public.schedules(id,user_id,title,scheduled_date,estimated_minutes) values($1,$2,'Owner plan','2026-11-01',60),($3,$4,'Other plan','2026-11-01',30)",
      [ownTask, owner, foreignTask, other]);
    await db.exec("set local role authenticated");
    await setIdentity(owner);
  });
  afterEach(async () => { await db.exec("rollback"); });

  it("enforces read, update, insert and linked-project ownership for two authenticated identities", async () => {
    const foreign = await db.query("select id from public.schedules where id=$1", [foreignTask]);
    expect(foreign.rows).toEqual([]);
    const invisibleWrite = await db.query("update public.schedules set title='stolen' where id=$1 returning id", [foreignTask]);
    expect(invisibleWrite.rows).toEqual([]);
    await rejectAndRecover(
      "insert into public.schedules(user_id,title) values($1,'Forged ownership')",
      [other], /row-level security|permission denied/i);
    await setIdentity(other);
    const ownerView = await db.query("select id from public.schedules where id=$1", [ownTask]);
    expect(ownerView.rows).toEqual([]);
    await setIdentity(owner);
  });

  it("rejects stale, missing and replayed schedule revisions without modifying the winner", async () => {
    const before = await revision(ownTask);
    expect((await mutate(ownTask, before, { title: "Winner" })).rows).toEqual([{ count: 1 }]);
    await rejectAndRecover(
      "select public.mutate_schedule($1::uuid,$2::timestamptz,$3::jsonb)",
      [ownTask, before, '{"title":"Lost update"}'], /changed on another device|40001/i);
    await rejectAndRecover(
      "select public.mutate_schedule($1::uuid,null::timestamptz,$2::jsonb)",
      [ownTask, '{"title":"Unversioned"}'], /changed on another device|40001/i);
    expect((await db.query<{ title: string }>(
      "select title from public.schedules where id=$1", [ownTask])).rows[0].title).toBe("Winner");
  });

  it("rolls back the entire recurring-series edit when any future revision is stale", async () => {
    const series = "33333333-3333-4333-8333-333333333333";
    const future = "44444444-4444-4444-8444-444444444444";
    // Insert a series through the same owner role used by the web app.
    await db.query("update public.schedules set series_id=$1 where id=$2", [series, ownTask]);
    await db.query("insert into public.schedules(id,user_id,title,series_id,scheduled_date) values($1,$2,'Future',$3,'2026-11-02')",
      [future, owner, series]);
    const rootVersion = await revision(ownTask);
    const obsoleteFutureVersion = await revision(future);
    await mutate(future, obsoleteFutureVersion, { notes: "A different device edited this" });
    await rejectAndRecover(
      "select public.mutate_schedule($1::uuid,$2::timestamptz,$3::jsonb,true,$4::jsonb)",
      [ownTask, rootVersion, '{"title":"Should rollback","scheduled_date":"2026-11-03"}',
        JSON.stringify({ [future]: obsoleteFutureVersion })],
      /future occurrence changed|40001/i);
    const rows = await db.query<{ id: string; title: string; day: string }>(
      "select id,title,scheduled_date::text as day from public.schedules where id in ($1,$2) order by id",
      [ownTask, future]);
    expect(rows.rows).toEqual([
      { id: ownTask, title: "Owner plan", day: "2026-11-01" },
      { id: future, title: "Future", day: "2026-11-02" },
    ]);
  });

  it("rejects foreign focus mutations and preserves revision-controlled completed state", async () => {
    const session = "55555555-5555-4555-8555-555555555555";
    // An active session under the owner role gets its revision from a DB trigger.
    await db.query("insert into public.focus_sessions(id,user_id,schedule_id) values($1,$2,$3)", [session, owner, ownTask]);
    await setIdentity(other);
    await rejectAndRecover(
      "select public.transition_focus($1::uuid,0,'pause')", [session], /Session not found/i);
    await setIdentity(owner);
    const paused = await db.query<{ focus_revision: number; focus_status: string }>(
      "select focus_revision,focus_status from public.transition_focus($1::uuid,0,'pause')", [session]);
    expect(paused.rows[0]).toMatchObject({ focus_revision: 1, focus_status: "paused" });
    // Idempotent repeated pause returns the same row without a second write.
    const repeated = await db.query<{ focus_revision: number }>(
      "select focus_revision from public.transition_focus($1::uuid,0,'pause')", [session]);
    expect(repeated.rows[0].focus_revision).toBe(1);
    await rejectAndRecover(
      "select public.transition_focus($1::uuid,0,'complete')", [session],
      /changed on another device|40001/i);
    const saved = await db.query<{ focus_revision: number; focus_status: string }>(
      "select focus_revision,focus_status from public.focus_sessions where id=$1", [session]);
    expect(saved.rows[0]).toMatchObject({ focus_revision: 1, focus_status: "paused" });
  });
});
