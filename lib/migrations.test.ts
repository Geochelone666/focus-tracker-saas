import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

const migrationsDir = path.join(process.cwd(), "supabase/migrations");
const sqlTestsDir = path.join(process.cwd(), "supabase/tests");
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";

/** Same order the Supabase CLI uses: lexical by file name. */
async function migrationFiles() {
  return (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
}

/** Minimal stand-in for the Supabase auth schema and default grants. */
async function freshDatabase(includeFocus = true) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  `);
  for (const file of await migrationFiles()) {
    if (!includeFocus && file === "20261025000000_focus_state.sql") break;
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    // PGlite ships without pgcrypto; gen_random_uuid() is built into PostgreSQL 13+.
    await db.exec(sql.replace(/create extension if not exists pgcrypto;/i, ""));
  }
  await db.query("insert into auth.users(id, email) values ($1, 'owner@example.invalid'), ($2, 'other@example.invalid')", [owner, other]);
  return db;
}

let db: PGlite | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function asUser<T>(user: string, fn: () => Promise<T>) {
  await db!.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return await fn();
  } finally {
    await db!.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

describe("supabase migrations", () => {
  it("has unique migration versions for Supabase CLI restoration",async()=>{
    const files=await migrationFiles(),versions=files.map(file=>file.split('_')[0]);
    expect(new Set(versions).size).toBe(versions.length);
  });
  it("apply cleanly in CLI order and pass every supabase/tests SQL check", async () => {
    db = await freshDatabase();
    for (const file of (await readdir(sqlTestsDir)).filter((f) => f.endsWith(".sql")).sort()) {
      await expect(db.exec(await readFile(path.join(sqlTestsDir, file), "utf8")), file).resolves.toBeDefined();
    }
  });

  it("can rerun the mobile notification migration",async()=>{db=await freshDatabase();await expect(db.exec(await readFile(path.join(migrationsDir,"20261023010000_mobile_push.sql"),"utf8"))).resolves.toBeDefined();});

  it("keeps one covering schedule owner/date index after Focus V1",async()=>{
    db=await freshDatabase();
    const result=await db.query<{indexname:string}>(
      "select indexname from pg_indexes where schemaname='public' and tablename='schedules' and indexname in ('schedules_owner_date','schedules_user_date_idx') order by indexname"
    );
    expect(result.rows.map(row=>row.indexname)).toEqual(['schedules_user_date_idx']);
  });


  it("caches owner identity in RLS policies without changing ownership checks", async () => {
    db = await freshDatabase();
    const result = await db.query<{ tablename: string; policyname: string; qual: string | null; with_check: string | null }>(
      "select tablename,policyname,qual,with_check from pg_policies where schemaname='public' and tablename in ('profiles','skills','projects','schedules','daily_reflections','integration_tokens','integration_activity','focus_sessions','focus_segments') order by tablename,policyname"
    );
    expect(result.rows).toHaveLength(19);
    for (const policy of result.rows) {
      const conditions = [policy.qual, policy.with_check].filter(Boolean).join(" ");
      expect(conditions, policy.policyname).toMatch(/select\\s+auth\\.uid\\(\\)/i);
      const withoutCachedIdentity = conditions.replace(/select\\s+auth\\.uid\\(\\)/gi, "");
      expect(withoutCachedIdentity, policy.policyname).not.toMatch(/auth\\.uid\\(\\)/i);
    }
  });

  it("keeps schedule ownership on focus sessions after the last migration", async () => {
    db = await freshDatabase();
    const foreign = (
      await db.query<{ id: string }>(
        "insert into public.schedules(user_id, title, scheduled_date) values ($1, 'Other plan', '2026-10-20') returning id",
        [other],
      )
    ).rows[0].id;
    const own = (
      await db.query<{ id: string }>(
        "insert into public.schedules(user_id, title, scheduled_date) values ($1, 'Own plan', '2026-10-20') returning id",
        [owner],
      )
    ).rows[0].id;

    await expect(
      asUser(owner, () =>
        db!.query("insert into public.focus_sessions(user_id, schedule_id) values ($1, $2)", [owner, foreign]),
      ),
    ).rejects.toThrow(/row-level security/);

    const session = (
      await asUser(owner, () =>
        db!.query<{ id: string }>(
          "insert into public.focus_sessions(user_id, schedule_id, started_at, ended_at, duration_sec) values ($1, $2, now(), now(), 0) returning id",
          [owner, own],
        ),
      )
    ).rows[0].id;
    await expect(
      asUser(owner, () =>
        db!.query("update public.focus_sessions set schedule_id = $2 where id = $1", [session, foreign]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("hides every user-owned table from anonymous sessions", async () => {
    db = await freshDatabase();
    await db.query("insert into public.skills(user_id, name) values ($1, 'Secret')", [owner]);
    await db.query("insert into public.schedules(user_id, title) values ($1, 'Secret')", [owner]);
    await db.query("insert into public.projects(user_id, name) values ($1, 'Secret')", [owner]);
    await db.query("insert into public.daily_reflections(user_id, day, note) values ($1, '2026-10-20', 'Secret')", [owner]);
    await db.exec("set role anon");
    try {
      for (const table of ["focus_sessions", "skills", "profiles", "schedules", "projects", "daily_reflections"]) {
        const result = await db.query(`select * from public.${table}`).catch((error: Error) => error);
        if (result instanceof Error) expect(result.message, table).toMatch(/permission denied/);
        else expect(result.rows, table).toEqual([]);
      }
    } finally {
      await db.exec("reset role");
    }
  });
});


describe("focus upgrade and rollback", () => {
  it("preserves legacy history, upgrades an active row, reruns and rolls back without dropping data", async () => {
    db = await freshDatabase(false);
    const history = (await db.query<{ id: string }>("insert into public.focus_sessions(user_id,started_at,ended_at,duration_sec,note) values($1,'2026-10-01T12:00:00Z','2026-10-01T13:00:00Z',3600,'legacy outcome') returning id",[owner])).rows[0];
    const active = (await db.query<{ id: string }>("insert into public.focus_sessions(user_id,started_at) values($1,'2026-10-23T12:00:00Z') returning id",[owner])).rows[0];
    const sql = await readFile(path.join(migrationsDir,"20261025000000_focus_state.sql"),"utf8");
    await db.exec(sql);
    const saved = (await db.query("select started_at,ended_at,duration_sec,note from public.focus_sessions where id=$1",[history.id])).rows[0];
    expect(saved).toMatchObject({duration_sec:3600,note:'legacy outcome'});
    expect((await db.query("select focus_status,resumed_at=started_at as original from public.focus_sessions where id=$1",[active.id])).rows[0]).toEqual({focus_status:'running',original:true});
    await asUser(owner,()=>db!.query("select * from public.transition_focus($1,0,'pause')",[active.id]));
    const paused = (await db.query("select * from public.focus_sessions where id=$1",[active.id])).rows[0];
    await db.exec(sql);
    expect((await db.query("select * from public.focus_sessions where id=$1",[active.id])).rows[0]).toEqual(paused);
    await asUser(owner,()=>db!.query("select * from public.transition_focus($1,1,'abandon')",[active.id]));
    await db.exec(`begin;
      do $$ begin if exists(select 1 from public.focus_sessions where ended_at is null) then raise exception 'Finish active sessions before downgrade'; end if; end $$;
      drop trigger focus_state_guard on public.focus_sessions;
      drop function public.transition_focus(uuid,integer,text,text,uuid);
      drop function public.guard_focus_state();
      commit;`);
    expect((await db.query("select started_at,ended_at,duration_sec,note from public.focus_sessions where id=$1",[history.id])).rows[0]).toEqual(saved);
    expect((await db.query("select count(*)::int as total from public.focus_sessions")).rows[0]).toEqual({total:2});
    await db.exec(sql);
    expect((await db.query("select focus_status,duration_sec from public.focus_sessions where id=$1",[active.id])).rows[0]).toEqual({focus_status:'abandoned',duration_sec:0});
  });
});
