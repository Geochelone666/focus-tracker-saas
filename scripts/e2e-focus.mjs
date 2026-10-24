// Local-only functional fixture: real Next Server Actions + migrated PGlite + Chromium.
// No hosted Supabase, production credentials, or production data are used.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { chromium } from '@playwright/test';

const owner = '00000000-0000-4000-8000-000000000001';
const fixturePort = Number(process.env.FOCUS_FIXTURE_PORT || 54329);
const appPort = Number(process.env.FOCUS_APP_PORT || 3100);
const base = `http://localhost:${appPort}`;
const db = new PGlite({parsers:{1184:value=>value,1082:value=>value}});
await db.exec(`create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,public to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
alter default privileges in schema public grant all on tables to anon,authenticated;
alter default privileges in schema public grant execute on functions to anon,authenticated;`);
for (const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) {
  await db.exec((await readFile(`supabase/migrations/${file}`,'utf8')).replace(/create extension if not exists pgcrypto;/i,''));
}
await db.query('insert into auth.users values ($1,$2)',[owner,'focus@example.invalid']);
await db.query('insert into public.profiles(user_id,timezone) values($1,$2) on conflict(user_id) do update set timezone=excluded.timezone',[owner,'America/Toronto']);
await db.query("insert into public.schedules(user_id,title,scheduled_date,estimated_minutes) values($1,'Focus fixture task',$2,60)",[owner,new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto'}).format(new Date())]);
await db.query("insert into public.skills(user_id,name) values($1,'Completion skill')",[owner]);
let queue = Promise.resolve();
function serial(fn) { const result=queue.then(fn);queue=result.catch(()=>{});return result; }
const user={id:owner,email:'focus@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
const jwt=[{alg:'HS256',typ:'JWT'},{sub:owner,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+86400},'fixture-signature'].map((v,i)=>i===2?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
const safe = value => { if(!/^[a-z_][a-z_0-9]*$/.test(value)) throw new Error('Unsupported fixture identifier');return `"${value}"`; };
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,`http://127.0.0.1:${fixturePort}`);
    let text='';for await(const part of req) text+=part;
    const body=text?JSON.parse(text):null;
    let output;
    if(url.pathname==='/auth/v1/user') {
      if(req.headers.authorization!==`Bearer ${jwt}`){res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({message:'Invalid fixture session'}));return;}
      output=user;
    } else {
      if(req.headers.authorization!==`Bearer ${jwt}`) throw new Error('Fixture requires authenticated session');
      output=await serial(async()=>{
        await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`);
        try {
          if(url.pathname==='/rest/v1/rpc/mutate_schedule') return (await db.query('select public.mutate_schedule($1,$2,$3,$4,$5) as changed',[body.p_id,body.p_expected,body.p_patch,body.p_future??false,body.p_revisions??{}])).rows[0].changed;
          if(url.pathname==='/rest/v1/rpc/next_focus_phase') return (await db.query('select * from public.next_focus_phase($1)',[body.p_id])).rows[0];
          if(url.pathname==='/rest/v1/rpc/transition_focus') {
            const result=await db.query('select * from public.transition_focus($1,$2,$3,$4,$5)',[body.p_id,body.p_revision,body.p_action,body.p_note,body.p_skill ?? null]);
            return result.rows[0];
          }
          const table=url.pathname.split('/').at(-1);
          if(!['focus_sessions','profiles','skills','schedules','projects','daily_reflections'].includes(table)) throw new Error('Unsupported fixture table');
          if(req.method==='POST') {
            const inserted=[];
            await db.exec('begin');
            try{for(const row of Array.isArray(body)?body:[body]){
              const keys=Object.keys(row),values=Object.values(row);
              inserted.push(...(await db.query(`insert into public.${safe(table)} (${keys.map(safe)}) values (${values.map((_,i)=>`$${i+1}`)}) returning *`,values)).rows);
            }await db.exec('commit');return inserted;}catch(error){await db.exec('rollback');throw error;}
          }
          if(req.method!=='GET') throw new Error('Unsupported fixture method');
          const params=[],conditions=[];
          for(const [key,value] of url.searchParams) {
            if(['select','order','offset','limit'].includes(key))continue;
            const dot=value.indexOf('.'),op=value.slice(0,dot),val=value.slice(dot+1);
            if(op==='is'&&val==='null'){conditions.push(`${safe(key)} is null`);continue;}
            const operator={eq:'=',gte:'>=',lt:'<',lte:'<='}[op];if(!operator)throw new Error('Unsupported fixture filter');
            params.push(val);conditions.push(`${safe(key)} ${operator} $${params.length}`);
          }
          const fields=(url.searchParams.get('select')||'*').split(',').map(c=>c==='*'?'*':safe(c)).join(',');
          const order=(url.searchParams.get('order')||'').split(',').filter(Boolean).map(s=>{const [key,dir]=s.split('.');return `${safe(key)} ${dir==='desc'?'desc':'asc'}`;}).join(',');
          const limit=Number(url.searchParams.get('limit')||1000),offset=Number(url.searchParams.get('offset')||0);
          if(!Number.isInteger(limit)||!Number.isInteger(offset)||limit<0||offset<0)throw new Error('Bad range');
          const rows=(await db.query(`select ${fields} from public.${safe(table)} ${conditions.length?'where '+conditions.join(' and '):''} ${order?'order by '+order:''} limit ${limit} offset ${offset}`,params)).rows;
          for (const row of rows) for (const key of ['scheduled_date','target_date','day']) if (row[key] instanceof Date) row[key] = row[key].toISOString().slice(0,10);
          return req.headers.accept?.includes('vnd.pgrst.object')?(rows[0]??null):rows;
        } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);"); }
      });
    }
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(output));
  } catch(error) {res.writeHead(error.code==='23505'?409:error.code==='40001'?409:400,{'content-type':'application/json'});res.end(JSON.stringify({message:error.message,code:error.code||'FIXTURE'}));}
});
await new Promise(resolve=>server.listen(fixturePort,'127.0.0.1',resolve));
let logs='';
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(appPort)],{env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${fixturePort}`,NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-anon-key',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
app.stdout.on('data',chunk=>{logs+=chunk;});app.stderr.on('data',chunk=>{logs+=chunk;});
let browser;
const rows=()=>serial(async()=>(await db.query('select * from public.focus_sessions order by created_at,id')).rows);
async function backdateRunning(minutes){await serial(async()=>{
  // Test-only clock fixture; production transitions themselves use the real trigger/RPC.
  await db.exec('alter table public.focus_sessions disable trigger focus_state_guard');
  try{await db.query("update public.focus_sessions set resumed_at=clock_timestamp()-($1 * interval '1 minute') where ended_at is null and focus_status='running'",[minutes]);}
  finally{await db.exec('alter table public.focus_sessions enable trigger focus_state_guard');}
});}
async function waitFor(predicate,message){for(let i=0;i<100;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,100));}throw new Error(message);}
try {
  await waitFor(async()=>{try{return(await fetch(base)).status===200;}catch{return false;}},'Next server readiness');
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH||undefined});
  const cookie={name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify({access_token:jwt,refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+86400,expires_in:86400,token_type:'bearer',user})).toString('base64url'),domain:'localhost',path:'/'};
  const first=await browser.newContext(),second=await browser.newContext();
  await first.addCookies([cookie]);await second.addCookies([cookie]);
  const a=await first.newPage(),b=await second.newPage();
  const errors=[];for(const page of [a,b])page.on('pageerror',error=>errors.push(error.message));
  await Promise.all([a.goto(base+'/dashboard'),b.goto(base+'/dashboard')]);
  await Promise.all([a.getByRole('button',{name:'Start Session',exact:true}).click(),b.getByRole('button',{name:'Start Session',exact:true}).click()]);
  await waitFor(async()=>(await rows()).length===1,'Two starts must create exactly one session');
  await backdateRunning(1);await a.reload();
  await a.getByRole('button',{name:'Pause focus',exact:true}).click();
  await a.getByRole('button',{name:'Resume focus',exact:true}).waitFor();
  const paused=(await rows())[0];assert.equal(paused.focus_status,'paused');assert.ok(Number(paused.accumulated_ms)>=60000);
  await a.reload();const frozen=await a.getByRole('timer').innerText();
  await a.clock.install();await a.clock.setFixedTime(new Date(Date.now()+600000));
  await a.waitForTimeout(1100);assert.equal(await a.getByRole('timer').innerText(),frozen,'Ten browser-clock minutes while paused do not accrue');
  assert.equal(Number((await rows())[0].accumulated_ms),Number(paused.accumulated_ms));
  await a.getByRole('button',{name:'Resume focus',exact:true}).click();await a.getByRole('button',{name:'Pause focus',exact:true}).waitFor();
  await b.reload(); // Both devices now hold the same running revision.
  await a.getByRole('button',{name:'Pause focus',exact:true}).click();await a.getByRole('button',{name:'Resume focus',exact:true}).waitFor();
  await b.getByRole('button',{name:'Finish focus',exact:true}).click();
  await b.getByRole('alert').filter({hasText:'another device'}).waitFor();
  assert.equal((await rows())[0].focus_status,'paused','Stale completion cannot overwrite pause');
  await a.getByRole('combobox',{name:'Skill on completion'}).selectOption({label:'Completion skill'});
  await a.getByRole('textbox',{name:'Outcome / note (optional)'}).fill('Completed focused work');
  await a.getByRole('button',{name:'Finish focus',exact:true}).click();await a.getByRole('button',{name:'Start Session',exact:true}).waitFor();
  const completed=(await rows())[0];assert.equal(completed.note,'Completed focused work');assert.ok(completed.skill_id,'Completion skill retained');assert.ok(completed.duration_sec>=60&&completed.duration_sec<70,'Pause not credited');
  await a.getByRole('combobox',{name:'Mode',exact:true}).selectOption('countdown');
  await a.getByRole('spinbutton',{name:'Countdown minutes'}).fill('25');
  await a.getByRole('button',{name:'Start Session',exact:true}).click();await a.getByRole('button',{name:'Pause focus',exact:true}).waitFor();
  await backdateRunning(26);await a.reload();
  await waitFor(async()=>(await rows()).some(s=>s.focus_mode==='countdown'&&s.duration_sec===1500),'Expired countdown must save capped duration');
  await a.getByRole('button',{name:'Start Session',exact:true}).waitFor();await a.reload();
  assert.equal((await rows()).filter(s=>s.focus_mode==='countdown').length,1,'Reload never inserts another completion');
  await a.getByRole('button',{name:'Start short break',exact:true}).click();
  await a.getByRole('button',{name:'Pause break',exact:true}).waitFor();
  await backdateRunning(6);await a.reload();
  await waitFor(async()=>(await rows()).some(s=>s.session_kind==='short_break'&&s.break_duration_sec===300&&s.duration_sec===0),'Five-minute break must be separate');
  await a.getByRole('heading',{name:'Cycle complete',exact:true}).waitFor();
  // Task entry point and mobile core controls use the same actions.
  await a.setViewportSize({width:390,height:844});await a.goto(base+'/today');
  await a.getByRole('button',{name:'Start focus',exact:true}).click();await a.getByRole('button',{name:'Pause focus',exact:true}).waitFor();
  assert.ok((await rows()).at(-1).schedule_id,'Today links the task');
  await a.getByRole('button',{name:'Pause focus',exact:true}).click();await a.getByRole('button',{name:'Resume focus',exact:true}).waitFor();
  await a.getByRole('button',{name:'Resume focus',exact:true}).click();await a.getByRole('button',{name:'Pause focus',exact:true}).waitFor();
  const overflow=await a.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert.ok(overflow<=0,`390px overflow: ${overflow}`);
  await a.getByRole('button',{name:'Abandon focus',exact:true}).click();
  await waitFor(async()=>(await rows()).some(s=>s.focus_status==='abandoned'&&s.duration_sec===0),'Abandon must retain zero-credit row');
  // Capture -> schedule -> reload -> desktop drag/resize -> mobile edit -> Inbox.
  await a.goto(base+'/inbox');
  const capture=a.getByRole('heading',{name:'Capture a task'}).locator('..').locator('form');
  await capture.getByLabel('Title',{exact:true}).fill('Calendar captured task');
  await capture.getByText('More options: priority, duration, repeat and links',{exact:true}).click();
  await capture.getByLabel('Estimated minutes').fill('60');
  await capture.getByLabel('Deadline (optional)').fill('2026-12-31');
  await capture.getByRole('button',{name:'Add plan',exact:true}).click();
  await capture.getByRole('status').waitFor();
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto'}).format(new Date());
  await a.goto(base+`/calendar?date=${today}&view=day`);
  await a.getByRole('combobox',{name:'Arrange task'}).selectOption({label:'Calendar captured task'});
  const editor=a.getByRole('heading',{name:'Arrange: Calendar captured task'}).locator('..');
  await editor.getByLabel('Start time').fill('14:00');await editor.getByLabel('Duration (minutes)').fill('90');
  await editor.getByRole('button',{name:'Save time block'}).click();await editor.getByRole('status').waitFor();
  await a.reload();
  const calendarTask=()=>serial(async()=>(await db.query("select * from public.schedules where title='Calendar captured task'")).rows[0]);
  assert.equal((await calendarTask()).scheduled_time,'14:00:00');assert.equal((await calendarTask()).estimated_minutes,90);assert.equal((await calendarTask()).deadline,'2026-12-31');
  await a.setViewportSize({width:1200,height:900});
  const timeline=a.getByLabel(`Timeline ${today}`,{exact:true});
  async function dropBlock(kind,minute){
    const task=await calendarTask();
    await timeline.evaluate((element,payload)=>{
      const transfer=new DataTransfer();transfer.setData('application/x-focus-task',JSON.stringify({id:payload.id,kind:payload.kind}));
      element.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientY:element.getBoundingClientRect().top+payload.minute*.8}));
    },{id:task.id,kind,minute});
  }
  await dropBlock('move',900);await waitFor(async()=>(await calendarTask()).scheduled_time==='15:00:00','Calendar drag did not persist');
  await a.reload();await dropBlock('resize',1020);await waitFor(async()=>(await calendarTask()).estimated_minutes===120,'Calendar resize did not persist');
  await a.reload();await a.setViewportSize({width:390,height:844});
  await a.getByRole('combobox',{name:'Arrange task'}).selectOption({label:'Calendar captured task'});
  const mobileEditor=a.getByRole('heading',{name:'Arrange: Calendar captured task'}).locator('..');
  await mobileEditor.getByLabel('Duration (minutes)').fill('60');await mobileEditor.getByRole('button',{name:'Save time block'}).click();
  await waitFor(async()=>(await calendarTask()).estimated_minutes===60,'Mobile edit did not persist');
  assert.equal((await calendarTask()).deadline,'2026-12-31');
  assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'Mobile calendar overflow');
  await a.reload();await a.getByRole('combobox',{name:'Arrange task'}).selectOption({label:'Calendar captured task'});
  const moveBack=a.getByRole('heading',{name:'Arrange: Calendar captured task'}).locator('..');
  await moveBack.getByLabel('Planned date').fill('');await moveBack.getByLabel('Start time').fill('');
  await moveBack.getByRole('button',{name:'Save time block'}).click();
  await waitFor(async()=>(await calendarTask()).scheduled_date===null,'Return to Inbox failed');
  assert.deepEqual(errors,[],'No browser runtime errors');
  console.log('PASS: real Server Actions + migrated SQL; concurrent starts, pause/reload, 10-minute paused clock, stale-device conflict, resume/finish/note, 25-minute countdown capped once, separate 5-minute break, Today task link, abandon, capture/calendar drag/resize/deadline/reload/Inbox, 390px controls.');
} catch(error) {console.error(logs.slice(-10000));const page=browser?.contexts()[0]?.pages()[0];if(page)console.error((await page.locator('body').innerText()).slice(-6000));throw error;}
finally {await browser?.close();app.kill('SIGTERM');await new Promise(resolve=>server.close(resolve));await queue;await db.close();}
