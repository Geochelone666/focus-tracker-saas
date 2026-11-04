import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import fixture from '../../docs/fixtures/smart-calendar-v01-sample.json';
import { previewSmartCalendar, type SmartCalendarSnapshotV01, type FocusScheduleRow } from './focus-adapter';
import { calendarDraftArguments } from './plan-wire';
import { liveCalendarPreview, type CalendarRead } from './live-preview';

it('encodes selected changes without losing revisions or confusing UUID and CAS versions', () => {
  const snapshot = structuredClone(fixture.snapshot) as SmartCalendarSnapshotV01;
  const { output } = previewSmartCalendar(snapshot);
  const context = { userId: snapshot.user_id, timezone: snapshot.timezone,
    revision: '9007199254740993', availability: snapshot.availability };
  const id = output.changes[0].schedule_id;
  const args = calendarDraftArguments(output, context, [id]);
  expect(args.p_base_revision).toBe('9007199254740993');
  expect(args.p_changes[0].expected_updated_at).toBe(snapshot.schedules[0].updated_at);
  expect(args.p_changes[0].start_at).toMatch(/:00Z$/);
  expect(() => calendarDraftArguments(output, context, [id, id])).toThrow(/distinct/);
  expect(() => calendarDraftArguments(output, context, ['missing'])).toThrow(/changed placement/);
  expect(() => calendarDraftArguments(output, { ...context, revision: snapshot.base_version_id! }, [id])).toThrow(/version/);
  expect(() => calendarDraftArguments(output, { ...context, userId: 'another-owner' }, [id])).toThrow(/Foreign/);
});

it('feeds actual algorithm output into migrated stage/confirm/replay/undo RPCs', async () => {
  const db = new PGlite();
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const task = '11111111-1111-4111-8111-111111111111';
  const request = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
    for (const name of (await readdir('supabase/migrations')).filter(x => x.endsWith('.sql')).sort()) {
      await db.exec((await readFile(`supabase/migrations/${name}`, 'utf8')).replace(/create extension if not exists pgcrypto;/i, ''));
    }
    await db.query('insert into auth.users(id,email) values ($1,\'a@test.invalid\'),($2,\'b@test.invalid\')', [owner, other]);
    await db.query('update profiles set timezone=\'UTC\' where user_id=$1', [owner]);
    await db.query('insert into schedules(id,user_id,title,estimated_minutes) values($1,$2,\'Integration\',60)', [task, owner]);
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const schedules = await db.query<FocusScheduleRow>(`select *,to_char(updated_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at from schedules`);
    const snapshot: SmartCalendarSnapshotV01 = {
      schema_version: 'smart-calendar/v0.1', user_id: owner, timezone: 'UTC',
      captured_at: '2027-06-15T08:00:00Z', window: {start_at:'2027-06-15T09:00:00Z',end_at:'2027-06-15T17:00:00Z'},
      base_version_id: null, schedules: schedules.rows, busy_intervals: [], accepted_blocks: [], focus_sessions: [],
      availability: [{user_id:owner,start_at:'2027-06-15T09:00:00Z',end_at:'2027-06-15T17:00:00Z'}],
    };
    const read = (await db.query<{snapshot:CalendarRead}>('select calendar_preview_snapshot() as snapshot')).rows[0].snapshot;
    expect(read.revision).toBe('0');
    expect(read.schedules).toHaveLength(1);
    const { output } = liveCalendarPreview(read,owner,{date:'2027-06-15',days:1,start:'09:00',end:'17:00'});
    const args = calendarDraftArguments(output, {userId:owner,timezone:'UTC',revision:'0',availability:snapshot.availability}, [task]);
    const staged = await db.query<{id:string}>("select stage_calendar_preview($1::jsonb,$2::jsonb,$3::bigint,'UTC') as id",
      [JSON.stringify(args.p_changes),JSON.stringify(args.p_availability),args.p_base_revision]);
    const draft = staged.rows[0].id;
    const confirm = () => db.query<{receipt: {receipt_id:string}}>('select confirm_calendar_draft($1,$2) as receipt', [draft,request]);
    const first = await confirm();
    expect((await confirm()).rows[0].receipt).toMatchObject({receipt_id:first.rows[0].receipt.receipt_id,revision:1,replay:true});
    expect((await db.query('select scheduled_time::text as time from schedules where id=$1',[task])).rows).toEqual([{time:'09:00:00'}]);
    const savedRead=(await db.query<{snapshot:CalendarRead}>('select calendar_preview_snapshot() as snapshot')).rows[0].snapshot;
    expect(savedRead.accepted_ids).toEqual([task]);
    expect(savedRead.undo_receipt_id).toBe(first.rows[0].receipt.receipt_id);
    expect(liveCalendarPreview(savedRead,owner,{date:'2027-06-15',days:1,start:'09:00',end:'17:00'}).output.placements[0].reason_codes).toContain('PRESERVED_ACCEPTED');
    await expect(db.query("select stage_calendar_preview($1::jsonb,$2::jsonb,'1','America/Toronto')",[JSON.stringify(args.p_changes),JSON.stringify(args.p_availability)])).rejects.toThrow(/Timezone changed/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
    expect((await db.query('select * from calendar_plan_receipts')).rows).toEqual([]);
    expect((await db.query<{snapshot:CalendarRead}>('select calendar_preview_snapshot() as snapshot')).rows[0].snapshot.schedules).toEqual([]);
    await expect(confirm()).rejects.toThrow();
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const receipt = (await db.query<{id:string}>('select id from calendar_plan_receipts')).rows[0].id;
    const undo = () => db.query<{receipt: {receipt_id:string}}>('select undo_calendar_plan($1,$2) as receipt', [receipt,'33333333-3333-4333-8333-333333333333']);
    const undone = await undo();
    expect((await undo()).rows[0].receipt).toMatchObject({receipt_id:undone.rows[0].receipt.receipt_id,revision:2,replay:true});
    expect((await db.query('select scheduled_time,scheduled_date from schedules where id=$1',[task])).rows)
      .toEqual([{scheduled_time:null,scheduled_date:null}]);
  } finally { await db.close(); }
}, 60_000);
