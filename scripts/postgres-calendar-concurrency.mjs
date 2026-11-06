// Real, two-connection PostgreSQL integration. Requires a disposable CI service.
// No production project IDs, credentials, or network connections are used.
import { readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const args=['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose',
  '-h',process.env.PGHOST||'127.0.0.1','-p',process.env.PGPORT||'5432',
  '-U',process.env.PGUSER||'postgres','-d',process.env.PGDATABASE||'focus_calendar_ci'];
const env={...process.env,PGPASSWORD:process.env.PGPASSWORD||'test-only-password'};
function sql(source,extra={}) {
  const r=spawnSync('psql',args,{input:source,encoding:'utf8',env:{...env,...extra},timeout:60000});
  if(r.status!==0)throw Error('psql error: '+r.stderr+'\n'+r.stdout);
  return r.stdout.trim();
}
function sqlFile(file){
  const r=spawnSync('psql',[...args,'-f',file],{encoding:'utf8',env,timeout:120000});
  if(r.status!==0)throw Error(file+': '+r.stderr+'\n'+r.stdout);
}
const owner='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const selected='f3511111-1111-4111-8111-111111111111';
const untouched='f3522222-2222-4222-8222-222222222222';
sql([
  'create role anon; create role authenticated; create role service_role bypassrls;',
  'create schema auth; create table auth.users (id uuid primary key,email text);',
  "create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
  'grant usage on schema auth,public to anon,authenticated,service_role;',
  'grant execute on function auth.uid() to anon,authenticated;',
  'alter default privileges in schema public grant all on tables to anon,authenticated,service_role;',
  'alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;'
].join('\n'));
const dir=resolve('supabase/migrations');
for(const f of readdirSync(dir).filter(x=>x.endsWith('.sql')).sort()){
  sqlFile(resolve(dir,f));
  console.log('Migrated',f);
}
sql("insert into auth.users(id,email) values('"+owner+"','owner@ci.invalid'),('"+other+"','other@ci.invalid');");
sqlFile(resolve('supabase/tests/calendar_plan_ledger.sql'));
sqlFile(resolve('supabase/tests/calendar_preview_snapshot.sql'));
sqlFile(resolve('supabase/tests/calendar_task_lock_controls.sql'));
sqlFile(resolve('supabase/tests/execution_recovery.sql'));
sqlFile(resolve('supabase/tests/calendar_work_preferences.sql'));
console.log('PostgreSQL: version, confirm replay, RLS, undo and rollback regression passed');
sql([
  'insert into public.schedules(id,user_id,title,scheduled_date,scheduled_time,estimated_minutes) values',
  "('"+selected+"','"+owner+"','Selected','2027-06-15','08:00',60),",
  "('"+untouched+"','"+owner+"','Unselected','2027-06-15','11:00',60),",
  "('f3533333-3333-4333-8333-333333333333','"+other+"','Foreign','2027-06-15','09:00',60);"
].join('\n'));
const stamp=sql("select to_char(updated_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') from public.schedules where id='"+selected+"';");
assert.match(stamp,/^20[0-9]{2}-/);
const payload="jsonb_build_array(jsonb_build_object('id','"+selected+
  "','expected_updated_at','"+stamp+
  "','scheduled_date','2027-06-15','scheduled_time','09:00','estimated_minutes',60))";
const a=spawn('psql',args,{env:{...env,PGAPPNAME:'focus_calendar_holder'},stdio:['pipe','pipe','pipe']});
let outA='',errA='';
a.stdout.on('data',d=>outA+=d.toString());
a.stderr.on('data',d=>errA+=d.toString());
a.stdin.write('begin;\nset local role authenticated;\n');
a.stdin.write("select set_config('request.jwt.claim.sub','"+owner+"',true);\n");
a.stdin.write("update public.schedules set scheduled_time='09:30' where id='"+untouched+"';\n");
a.stdin.write("select 'LOCK_READY';\n");
async function until(test,timeout=10000){
  const end=Date.now()+timeout;
  while(!test()){
    if(Date.now()>end)throw Error('Timeout waiting for SQL synchronization. A:'+outA+' / '+errA);
    await new Promise(r=>setTimeout(r,50));
  }
}
await until(()=>outA.includes('LOCK_READY'));
const b=spawn('psql',args,{env:{...env,PGAPPNAME:'focus_calendar_contender'},stdio:['pipe','pipe','pipe']});
let outB='',errB='',exitB=null;
b.stdout.on('data',d=>outB+=d.toString());
b.stderr.on('data',d=>errB+=d.toString());
b.on('exit',code=>exitB=code);
b.stdin.end('begin;\nset local role authenticated;\n'+
  "select set_config('request.jwt.claim.sub','"+owner+"',true);\n"+
  'select public.apply_schedule_batch('+payload+');\ncommit;\n');
let blocked=false;
const limit=Date.now()+8000;
while(Date.now()<limit&&!blocked&&exitB===null){
  blocked=Number(sql("select count(*) from pg_stat_activity where application_name='focus_calendar_contender' and wait_event_type='Lock';"))>0;
  if(!blocked)await new Promise(r=>setTimeout(r,100));
}
// We release the writer only after observing the second backend wait on
// the unselected row; a sleep-only race test could pass by accident.
a.stdin.end('commit;\n');
await until(()=>exitB!==null,10000);
assert.equal(blocked,true,'The contender did not lock untouched rows; output: '+outB+' / '+errB);
assert.notEqual(exitB,0,'Conflicting batch wrongly committed');
assert.match(errB,/23P01|Calendar time conflict/i,'Expected overlap rejection: '+errB);
const positions=sql("select id::text||'='||to_char(scheduled_time,'HH24:MI') from public.schedules where id in ('"+selected+"','"+untouched+"') order by id;");
assert.match(positions,/=08:00/,'Selected task must remain unchanged after rejection');
assert.match(positions,/=09:30/,'Unselected direct update must commit');
console.log('PostgreSQL two-connection TOCTOU: wait observed; conflict rejected; atomic rollback preserved');

// A conflict is NOT a silently successful retry: re-read the task, choose
// a new valid slot, and submit a fresh intentional change.
const freshStamp=sql("select to_char(updated_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') from public.schedules where id='"+selected+"';");
const freshPayload="jsonb_build_array(jsonb_build_object('id','"+selected+
  "','expected_updated_at','"+freshStamp+
  "','scheduled_date','2027-06-15','scheduled_time','10:45','estimated_minutes',60))";
sql('begin;\nset local role authenticated;\n'+
  "select set_config('request.jwt.claim.sub','"+owner+"',true);\n"+
  'select public.apply_schedule_batch('+freshPayload+');\ncommit;\n');
assert.equal(sql("select to_char(scheduled_time,'HH24:MI') from public.schedules where id='"+selected+"';"),
  '10:45','An explicit fresh retry should commit after the conflict is resolved');
let staleRejected=false;
try {
  sql('begin;\nset local role authenticated;\n'+
    "select set_config('request.jwt.claim.sub','"+owner+"',true);\n"+
    'select public.apply_schedule_batch('+freshPayload+');\nrollback;\n');
} catch(error) {
  staleRejected=/40001|Task changed; reload plan/.test(String(error));
}
assert.equal(staleRejected,true,'Identical stale revision must be rejected after the successful retry');
console.log('PostgreSQL bounded retry: fresh intent accepted, stale replay rejected');


// A new, previously invisible block must also serialize against confirmation.
const phantom='f3544444-4444-4444-8444-444444444444';
const confirmRequest='f3555555-5555-4555-8555-555555555555';
const confirmStamp=sql("select updated_at::text from public.schedules where id='"+selected+"';");
assert.equal(sql("select timezone from public.profiles where user_id='"+owner+"';"),'America/Toronto');
const authSql="set local role authenticated; select set_config('request.jwt.claim.sub','"+owner+"',true);\n";
const draftSql="select public.stage_calendar_draft(jsonb_build_array(jsonb_build_object('id','"+selected+"','expected_updated_at','"+confirmStamp+
 "','start_at','2027-06-15T17:00:00Z','end_at','2027-06-15T18:00:00Z')),"+
 "'[ {\"start_at\":\"2027-06-15T13:00:00Z\",\"end_at\":\"2027-06-15T22:00:00Z\"} ]'::jsonb,0);";
const phantomDraft=sql('begin;\n'+authSql+draftSql+'\ncommit;').split('\n').at(-1);
assert.match(phantomDraft,/^[0-9a-f-]{36}$/);
const insertHolder=spawn('psql',args,{env:{...env,PGAPPNAME:'focus_insert_holder'},stdio:['pipe','pipe','pipe']});
let insertOut='',insertErr='';
insertHolder.stdout.on('data',d=>insertOut+=d);insertHolder.stderr.on('data',d=>insertErr+=d);
insertHolder.stdin.write('begin;\n'+authSql+
 "insert into public.schedules(id,user_id,title,scheduled_date,scheduled_time,estimated_minutes) values('"+phantom+"','"+owner+"','New concurrent meeting','2027-06-15','13:30',60);\nselect 'INSERT_READY';\n");
await until(()=>insertOut.includes('INSERT_READY'));
const confirmContender=spawn('psql',args,{env:{...env,PGAPPNAME:'focus_insert_contender'},stdio:['pipe','pipe','pipe']});
let confirmExit=null,confirmErr='';
confirmContender.stdout.resume();confirmContender.stderr.on('data',d=>confirmErr+=d);confirmContender.on('exit',code=>confirmExit=code);
confirmContender.stdin.end('begin;\n'+authSql+"select public.confirm_calendar_draft('"+phantomDraft+"','"+confirmRequest+"');\ncommit;\n");
let insertWait=false;const insertLimit=Date.now()+8000;
while(Date.now()<insertLimit&&!insertWait&&confirmExit===null){
 insertWait=Number(sql("select count(*) from pg_stat_activity where application_name='focus_insert_contender' and wait_event_type='Lock';"))>0;
 if(!insertWait)await new Promise(r=>setTimeout(r,100));
}
insertHolder.stdin.end('commit;\n');
await until(()=>confirmExit!==null);
assert.equal(insertWait,true,'Confirmation must wait for the concurrent INSERT');
assert.equal(insertErr,'');
assert.notEqual(confirmExit,0,'Confirmation must reject the newly committed overlapping task');
assert.match(confirmErr,/23P01|Calendar time conflict/);
assert.equal(sql("select to_char(scheduled_time,'HH24:MI') from public.schedules where id='"+selected+"';"),'10:45');
assert.equal(sql("select to_char(scheduled_time,'HH24:MI') from public.schedules where id='"+phantom+"';"),'13:30');
assert.equal(sql("select count(*) from public.calendar_plan_receipts where user_id='"+owner+"' and request_id='"+confirmRequest+"';"),'0');
assert.equal(sql("select revision from public.calendar_plan_state where user_id='"+owner+"';"),'0');
console.log('PostgreSQL INSERT phantom: confirmation waited, new overlap rejected, task and ledger unchanged');

// Two devices race to lock the same task from the same unlocked snapshot.
const lockStamp=sql("select updated_at::text from public.schedules where id='"+selected+"';");
const lockCall="select public.set_calendar_task_lock('"+selected+"','"+lockStamp+"',null,true);\n";
const identity="set local role authenticated; select set_config('request.jwt.claim.sub','"+owner+"',true);\n";
const lockHolder=spawn('psql',args,{env:{...env,PGAPPNAME:'focus_lock_holder'},stdio:['pipe','pipe','pipe']});
let holderOut='',holderErr='';
lockHolder.stdout.on('data',d=>holderOut+=d);lockHolder.stderr.on('data',d=>holderErr+=d);
lockHolder.stdin.write('begin;\n'+identity+lockCall+"select 'LOCK_CREATED';\n");
await until(()=>holderOut.includes('LOCK_CREATED'));
const lockContender=spawn('psql',args,{env:{...env,PGAPPNAME:'focus_lock_contender'},stdio:['pipe','pipe','pipe']});
let lockExit=null,lockErr='';
lockContender.stdout.resume();lockContender.stderr.on('data',d=>lockErr+=d);lockContender.on('exit',code=>lockExit=code);
lockContender.stdin.end('begin;\n'+identity+lockCall+'commit;\n');
let lockWait=false;const lockLimit=Date.now()+8000;
while(Date.now()<lockLimit&&!lockWait&&lockExit===null){
 lockWait=Number(sql("select count(*) from pg_stat_activity where application_name='focus_lock_contender' and wait_event_type='Lock';"))>0;
 if(!lockWait)await new Promise(r=>setTimeout(r,100));
}
lockHolder.stdin.end('commit;\n');
await until(()=>lockExit!==null);
assert.equal(lockWait,true,'Lock contender must wait for the first device');
assert.notEqual(lockExit,0,'Stale device must not overwrite the lock');
assert.match(lockErr,/40001|Task lock changed/);
assert.equal(holderErr,'');
assert.equal(sql("select count(*) from public.calendar_task_locks where schedule_id='"+selected+"';"),'1');
console.log('PostgreSQL lock race: wait observed, first lock preserved, stale second device rejected');

// A saved preference edit serializes with confirmation even when the draft's
// original hours would still contain its placement. Observe an actual lock wait.
const workTask='f3566666-6666-4666-8666-666666666666';
sql("insert into public.schedules(id,user_id,title,estimated_minutes) values('"+workTask+"','"+owner+"','Preference race',60);");
sql('begin;\n'+authSql+"select public.save_calendar_work_preferences('09:00','17:00',0,'America/Toronto');\ncommit;");
const workStamp=sql("select updated_at::text from public.schedules where id='"+workTask+"';");
const workDraft=sql('begin;\n'+authSql+"select public.stage_calendar_preview("+
 "jsonb_build_array(jsonb_build_object('id','"+workTask+"','expected_updated_at','"+workStamp+"','start_at','2027-07-10T14:00:00Z','end_at','2027-07-10T15:00:00Z')),"+
 "'[ {\"start_at\":\"2027-07-10T13:00:00Z\",\"end_at\":\"2027-07-10T21:00:00Z\"} ]'::jsonb,0,'America/Toronto',"+
 "jsonb_build_object('schema_version','smart-calendar/v0.1','input_fingerprint','sha256:'||repeat('a',64),'base_version_id',null,'work_revision','1'));\ncommit;").split('\n').at(-1);
assert.match(workDraft,/^[0-9a-f-]{36}$/);
const workHolder=spawn('psql',args,{env:{...env,PGAPPNAME:'focus_work_holder'},stdio:['pipe','pipe','pipe']});
let workOut='',workErr='';
workHolder.stdout.on('data',d=>workOut+=d);workHolder.stderr.on('data',d=>workErr+=d);
workHolder.stdin.write('begin;\n'+authSql+"select public.save_calendar_work_preferences('10:00','18:00',1,'America/Toronto');\nselect 'WORK_READY';\n");
await until(()=>workOut.includes('WORK_READY'));
const workContender=spawn('psql',args,{env:{...env,PGAPPNAME:'focus_work_contender'},stdio:['pipe','pipe','pipe']});
let workExit=null,workConfirmErr='';
workContender.stdout.resume();workContender.stderr.on('data',d=>workConfirmErr+=d);workContender.on('exit',code=>workExit=code);
workContender.stdin.end('begin;\n'+authSql+"select public.confirm_calendar_draft('"+workDraft+"','f3577777-7777-4777-8777-777777777777');\ncommit;");
let workWait=false;const workLimit=Date.now()+8000;
while(Date.now()<workLimit&&!workWait&&workExit===null){
 workWait=Number(sql("select count(*) from pg_stat_activity where application_name='focus_work_contender' and wait_event_type='Lock';"))>0;
 if(!workWait)await new Promise(r=>setTimeout(r,100));
}
workHolder.stdin.end('commit;\n');
await until(()=>workExit!==null);
assert.equal(workWait,true,'Confirmation must wait for saved work hours');
assert.equal(workErr,'');assert.notEqual(workExit,0);assert.match(workConfirmErr,/40001.*Work hours changed/);
assert.equal(sql("select count(*) from public.calendar_plan_receipts where draft_id='"+workDraft+"';"),'0');
assert.equal(sql("select revision from public.calendar_plan_state where user_id='"+owner+"';"),'0');
assert.equal(sql("select scheduled_date is null and updated_at='"+workStamp+"'::timestamptz from public.schedules where id='"+workTask+"';"),'t');
console.log('PostgreSQL work hours race: lock wait observed, stale confirmation rejected and task/ledger changes rolled back');

// Remove newer entrypoints before the original B03-only rollback rehearsal.
sql('drop trigger calendar_receipt_work_hours on public.calendar_plan_receipts; drop function public.guard_calendar_receipt_work_hours(); drop function public.stage_calendar_preview(jsonb,jsonb,bigint,text,jsonb); drop function public.set_calendar_task_lock(uuid,timestamptz,timestamptz,boolean); drop function public.stage_calendar_preview(jsonb,jsonb,bigint,text); drop function public.calendar_preview_snapshot();');
const beforeRollback=sql("select coalesce(jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'scheduled_time',scheduled_time) order by id),'[]'::jsonb)::text from public.schedules;");
sqlFile(resolve('supabase/rollback/calendar_plan_rollback.sql'));
const afterRollback=sql("select coalesce(jsonb_agg(jsonb_build_object('id',id,'user_id',user_id,'scheduled_time',scheduled_time) order by id),'[]'::jsonb)::text from public.schedules;");
assert.equal(afterRollback,beforeRollback,'Rollback must preserve all existing task rows');
assert.equal(sql("select count(*) from pg_proc where oid=to_regprocedure('public.confirm_calendar_draft(uuid,uuid)');"),'0');
assert.equal(sql("select count(*) from pg_proc where oid=to_regprocedure('public.apply_schedule_batch(jsonb)');"),'1');
console.log('PostgreSQL rollback: F2-B03 objects removed, F2-B02 RPC and task data preserved');
