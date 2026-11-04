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
