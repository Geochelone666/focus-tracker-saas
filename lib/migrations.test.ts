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
async function freshDatabase() {
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
  it("apply cleanly in CLI order and pass every supabase/tests SQL check", async () => {
    db = await freshDatabase();
    for (const file of (await readdir(sqlTestsDir)).filter((f) => f.endsWith(".sql")).sort()) {
      await expect(db.exec(await readFile(path.join(sqlTestsDir, file), "utf8")), file).resolves.toBeDefined();
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
