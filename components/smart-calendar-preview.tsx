'use client';
import {useEffect,useRef,useState} from 'react';
import {DAY,ZONE,EXAMPLE,FIXED,initialDecisions,selectedSlot,formatSlot,sameSlot,conflictMap,type Decision,type Slot} from '@/lib/smart-calendar-demo';
type Failure='none'|'network'|'revision'|'submit';
export function SmartCalendarPreview(){
 const [choices,setChoices]=useState<Decision>(initialDecisions);
 const [loading,setLoading]=useState(false),[loadError,setLoadError]=useState(false);
 const [failure,setFailure]=useState<Failure>('none'),[notice,setNotice]=useState(''),[confirmed,setConfirmed]=useState(false);
 const [filter,setFilter]=useState<'all'|'conflicts'|'unscheduled'>('all');
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 const errors=conflictMap(EXAMPLE,choices),conflicts=Object.keys(errors).length;
 const resolved=EXAMPLE.map(task=>({task,slot:selectedSlot(task,choices)}));
 const changes=resolved.filter(x=>!sameSlot(x.task.current,x.slot)).length;
 const unscheduled=resolved.filter(x=>!x.slot).length;
 const filtered=resolved.filter(x=>filter==='all'||(filter==='conflicts'&&!!errors[x.task.id])||(filter==='unscheduled'&&!x.slot));
 const modify=(fn:(s:Decision)=>Decision)=>{setChoices(fn);setConfirmed(false);setNotice('');};
 const accept=(id:string,yes:boolean)=>modify(s=>({...s,accepted:{...s.accepted,[id]:yes}}));
 const lock=(id:string)=>modify(s=>{const next=!s.locked[id];return {...s,locked:{...s.locked,[id]:next},accepted:next?{...s.accepted,[id]:false}:s.accepted};});
 const override=(id:string,value:Slot)=>modify(s=>({...s,accepted:{...s.accepted,[id]:true},manual:{...s.manual,[id]:value}}));
 const reset=()=>{if(timer.current)clearTimeout(timer.current);setChoices(initialDecisions());setFailure('none');setFilter('all');setLoading(false);setLoadError(false);setConfirmed(false);setNotice('');};
 const load=()=>{if(timer.current)clearTimeout(timer.current);setLoading(true);setLoadError(false);setNotice('');setConfirmed(false);
  timer.current=setTimeout(()=>{setLoading(false);setLoadError(failure==='network');if(failure!=='network'){setChoices(initialDecisions());setNotice('Fixed fixture refreshed locally.');}},300);
 };
 const confirm=()=>{setNotice('');if(conflicts){setNotice('Resolve or reject conflicting blocks before confirming the demo. Nothing was saved.');return;}
  if(failure==='revision'){setNotice('Simulated stale revision. Regenerate the example before confirming.');return;}
  if(failure==='submit'){setNotice('Simulated submit failure. All choices remain local and editable.');return;}
  setConfirmed(true);setNotice('Demo confirmation only. No request or database update occurred.');
 };
 return <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
  <header className="mb-7 border-b border-slate-200 pb-6">
   <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-widest text-slate-600">Smart Calendar · Preview lab</p><p className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">DEMO / FIXED DATA / NO SAVES</p></div>
   <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Review a proposed day.</h1>
   <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Compare each original task with a suggested time. Keep, move, lock, or leave it unscheduled. This is an interactive example, not a connected scheduler.</p>
   <p className="mt-2 text-xs text-slate-500">{DAY} · {ZONE} · Example availability 09:00–17:00</p>
  </header>
  <section aria-label="Prototype controls" className="mb-6 flex flex-wrap items-end gap-3">
   <label className="text-sm">Test condition<select aria-label="Test condition" value={failure} onChange={e=>{setFailure(e.target.value as Failure);setNotice('');}} className="mt-1 block rounded border bg-white px-3 py-2"><option value="none">Normal fixture</option><option value="network">Simulated network failure</option><option value="revision">Simulated version conflict</option><option value="submit">Simulated submit failure</option></select></label>
   <button type="button" disabled={loading} onClick={load} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm disabled:opacity-50">Reload example</button>
   <button type="button" onClick={reset} className="px-3 py-2 text-sm underline underline-offset-4">Reset decisions</button>
  </section>
  {loading&&<section role="status" aria-busy="true" className="rounded-lg border bg-white p-6">Preparing fixed example…</section>}
  {loadError&&!loading&&<section role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-5 text-sm text-rose-900">Simulated network failure. No live data was accessed. <button onClick={()=>{setLoadError(false);setFailure('none');}} className="ml-2 font-semibold underline">Retry sample</button></section>}
  {!loading&&!loadError&&<>
   {notice&&<p role="status" className="mb-4 rounded-lg border bg-white p-4 text-sm">{notice}</p>}
   <section aria-label="Proposal summary" className="mb-6 grid gap-3 sm:grid-cols-3">
    {([['Changed blocks',changes],['Conflicts',conflicts],['Unscheduled',unscheduled]] as const).map(([name,count])=><div key={name} className="border-l-2 border-slate-600 bg-white px-4 py-3"><p className="text-xs text-slate-600">{name}</p><p className="text-2xl font-semibold tabular-nums">{count}</p></div>)}
   </section>
   <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
    <main className="min-w-0">
     <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Task-by-task decisions</h2><div role="group" aria-label="Preview filters" className="flex flex-wrap gap-2">{(['all','conflicts','unscheduled'] as const).map(f=><button key={f} type="button" aria-pressed={filter===f} onClick={()=>setFilter(f)} className={filter===f?'rounded-full bg-slate-900 px-3 py-2 text-xs text-white':'rounded-full border bg-white px-3 py-2 text-xs'}>{f==='all'?'All':f==='conflicts'?'Conflicts':'Unscheduled'}</button>)}</div></div>
     {filtered.length===0&&<div className="rounded-xl border border-dashed bg-white p-8 text-center"><p className="font-medium">Nothing in this view.</p><p className="mt-2 text-sm text-slate-600">Switch filters to review other tasks.</p></div>}
     <div className="space-y-3">{filtered.map(({task,slot})=>{const locked=!!choices.locked[task.id],issues=errors[task.id]??[],edit=slot??{day:DAY,start:'16:00',minutes:task.proposed?.minutes??30};return <article key={task.id} className={issues.length?'rounded-xl border border-amber-400 bg-white p-4 sm:p-5':'rounded-xl border border-slate-200 bg-white p-4 sm:p-5'}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs text-slate-500">{task.group}</p><h3 className="mt-1 text-base font-semibold">{task.title}</h3></div><span className="rounded bg-slate-100 px-2 py-1 text-xs">{locked?'Locked':issues.length?'Conflict':slot?'Ready':'Unscheduled'}</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-md bg-slate-50 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Before</p><p className="mt-2 font-medium">{formatSlot(task.current)}</p></div><div className="rounded-md border p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Proposed / edited</p><p className="mt-2 font-medium">{formatSlot(slot)}</p></div></div>
      <p className="mt-3 text-sm leading-6 text-slate-600"><span className="mr-2 font-mono text-xs">{task.reasonCode}</span>{task.reason}</p>
      {issues.length>0&&<ul aria-label={'Conflicts for '+task.title} className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-950">{issues.map(s=><li key={s}>{s}</li>)}</ul>}
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={locked} aria-pressed={choices.accepted[task.id]!==false&&!locked} onClick={()=>accept(task.id,true)} className="rounded-md border px-3 py-2 text-sm disabled:opacity-40">Accept suggestion</button><button type="button" disabled={locked} aria-pressed={choices.accepted[task.id]===false} onClick={()=>accept(task.id,false)} className="rounded-md border px-3 py-2 text-sm disabled:opacity-40">Keep original</button><button type="button" aria-pressed={locked} onClick={()=>lock(task.id)} className="rounded-md border px-3 py-2 text-sm">{locked?'Unlock block':'Lock original'}</button></div>
      {!locked&&<details className="mt-3 border-t pt-3"><summary className="cursor-pointer text-sm font-medium underline">Adjust time manually</summary><div className="mt-3 flex flex-wrap items-end gap-3"><label className="text-xs">Start<input type="time" aria-label={'Manual start for '+task.title} value={edit.start} onChange={e=>override(task.id,{...edit,start:e.target.value})} className="mt-1 block rounded border px-2 py-2 text-sm"/></label><label className="text-xs">Minutes<input type="number" min={15} max={480} aria-label={'Manual duration for '+task.title} value={edit.minutes} onChange={e=>{const n=Number(e.target.value);if(n>=15&&n<=480&&Number.isInteger(n))override(task.id,{...edit,minutes:n});}} className="mt-1 block w-24 rounded border px-2 py-2 text-sm"/></label><button type="button" onClick={()=>override(task.id,edit)} className="rounded border px-3 py-2 text-sm">Use this time</button></div></details>}
     </article>;})}</div>
    </main>
    <aside className="space-y-4">
     <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold">Fixed commitments</h2><p className="mt-2 text-xs text-slate-600">Never moved by this sample.</p><ul className="mt-3 space-y-3">{FIXED.map(x=><li key={x.id} className="border-l-2 border-slate-400 pl-3 text-sm"><p className="font-medium">{x.title}</p><p className="text-slate-600">{formatSlot(x.slot)}</p></li>)}</ul></section>
     <section className="rounded-xl border bg-slate-50 p-5"><h2 className="font-semibold">Local confirmation</h2><p className="mt-2 text-sm leading-6 text-slate-600">Only changes this browser preview. Real confirmation, transaction, rollback and API integration await the agreed contract.</p><button type="button" disabled={confirmed} onClick={confirm} className="mt-4 w-full rounded-md bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Confirm demo selection</button>{confirmed&&<button type="button" onClick={()=>{setConfirmed(false);setNotice('Local demo confirmation undone.');}} className="mt-3 w-full rounded-md border bg-white px-4 py-3 text-sm font-medium">Undo demo confirmation</button>}<p className="mt-3 text-xs text-slate-600">No server request. No saved tasks.</p></section>
    </aside>
   </div>
  </>}
 </div>;
}
