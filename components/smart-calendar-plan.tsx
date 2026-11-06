'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { schedulingReason } from '@/lib/smart-scheduler/reason-labels';
import { SmartCalendarComparison } from './smart-calendar-comparison';
import type { PlanEdit } from '@/lib/smart-scheduler/plan-comparison';
import type { LivePreview, CalendarTaskChoice, WorkPreferences } from '@/lib/smart-scheduler/live-preview';
import { generateCalendarPreview, stageCalendarSelection, confirmCalendarSelection, undoCalendarSelection, setCalendarTaskLock, saveCalendarWorkHours } from '@/app/calendar/smart-plan/actions';

type Edit=PlanEdit;
type Pending={draftId:string;requestId:string};
function local(iso:string,zone:string){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));
  const get=(name:string)=>parts.find(p=>p.type===name)!.value;
  return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};
}
const input='min-h-11 rounded border px-3 py-2 disabled:opacity-50';
export function SmartCalendarPlan({owner,today,zone,latestReceipt,initialTasks,initialWorkHours}:{owner:string;today:string;zone:string;latestReceipt:string|null;initialTasks:CalendarTaskChoice[];initialWorkHours:WorkPreferences|null}){
  const router=useRouter();
  const [busy,startTransition]=useTransition();
  const [date,setDate]=useState(today),[days,setDays]=useState(7),[start,setStart]=useState(initialWorkHours?.start??'09:00'),[end,setEnd]=useState(initialWorkHours?.end??'17:00');
  const [workHours,setWorkHours]=useState(initialWorkHours);
  const hoursSaved=!!workHours&&workHours.start===start&&workHours.end===end;
  const [preview,setPreview]=useState<LivePreview|null>(null),[edits,setEdits]=useState<Record<string,Edit>>({});
  const [notice,setNotice]=useState(''),[pending,setPending]=useState<Pending|null>(null);
  const [receipt,setReceipt]=useState(latestReceipt),[undoKey,setUndoKey]=useState<string|null>(null);
  const [tasks,setTasks]=useState(initialTasks),[taskId,setTaskId]=useState(initialTasks[0]?.id??'');
  const [windowChanged,setWindowChanged]=useState(false);
  const selectedTask=tasks.find(task=>task.id===taskId);
  const changedWindow=()=>{if(preview){setWindowChanged(true);setNotice('Work window changed. Generate a new preview before confirming. Your existing edits remain below.');}};
  const saveHours=()=>startTransition(async()=>{
    try{
      const result=await saveCalendarWorkHours(start,end,workHours?.revision??'0',zone);
      if(result.error){setNotice(result.error);return;}
      setWorkHours(result.preferences!);changedWindow();
      setNotice('Work hours saved across devices. Generate a new preview to use them.');
      router.refresh();
    }catch{setNotice('Could not save work hours. Your edits are kept; retry or reload to check the saved hours.');}
  });
  const changeLock=()=>startTransition(async()=>{
    if(!selectedTask)return;
    try{
      const result=await setCalendarTaskLock(selectedTask.id,selectedTask.revision,selectedTask.lockVersion,!selectedTask.locked);
      if(result.error){setNotice(result.error);return;}
      setTasks(current=>current.map(task=>task.id===selectedTask.id?{...task,locked:result.locked!,lockVersion:result.lockVersion??null}:task));
      setPreview(null);setEdits({});setWindowChanged(false);
      setNotice(result.locked?'Task locked. Generate a fresh preview; its current time will stay fixed.':'Task unlocked. Generate a fresh preview. Manually scheduled tasks still keep their time.');
      router.refresh();
    }catch{setNotice('Could not update the lock. Reload to check its current state before retrying.');}
  });
  const key=`focus-calendar-request:${owner}`;
  useEffect(()=>{
    try{const saved=JSON.parse(localStorage.getItem(key)??'null');if(saved?.draftId&&saved?.requestId){setPending(saved);setNotice('A previous confirmation may need checking. Retry it safely before generating another plan.');}}
    catch{/* Storage may be disabled. Database receipts remain authoritative. */}
  },[key]);
  const persist=(value:Pending|null)=>{setPending(value);try{if(value)localStorage.setItem(key,JSON.stringify(value));else localStorage.removeItem(key);}catch{/* Same-page retries still retain the request. */}};
  const generate=()=>startTransition(async()=>{
    setNotice('');
    try{
      const result=await generateCalendarPreview({date,days,start,end});
      if(result.error){setNotice(result.error);return;}
      if(!result.preview)return;
      const next:Record<string,Edit>={};
      const changed=new Set(result.preview.output.changes.filter(c=>c.after&&JSON.stringify(c.before)!==JSON.stringify(c.after)).map(c=>c.schedule_id));
      let selected=0;
      for(const p of result.preview.output.placements)if(changed.has(p.schedule_id))next[p.schedule_id]={...local(p.start_at,result.preview.timezone),minutes:(Date.parse(p.end_at)-Date.parse(p.start_at))/60000,selected:selected++<50};
      setPreview(result.preview);setEdits(next);setTasks(result.preview.tasks);setWindowChanged(false);
      setNotice(Object.keys(next).length?'Review the selected changes below. Nothing has been saved.':'No changes proposed. Existing blocks stay in place.');
    }catch{setNotice('Connection failed. Try generating the preview again.');}
  });
  const confirm=()=>startTransition(async()=>{
    setNotice('');
    try{
      let operation=pending;
      if(!operation){
        if(!preview||windowChanged)return;
        const chosen=Object.entries(edits).filter(([,edit])=>edit.selected);
        const result=await stageCalendarSelection({timezone:preview.timezone,revision:preview.revision,availability:preview.availability,
          contract:{schema_version:preview.output.schema_version,input_fingerprint:preview.output.input_fingerprint,base_version_id:preview.output.base_version_id,work_revision:preview.workRevision!},
          changes:chosen.map(([id,edit])=>({id,expected_updated_at:preview.output.placements.find(p=>p.schedule_id===id)!.expected_updated_at,date:edit.date,time:edit.time,minutes:edit.minutes}))});
        if(result.error){setNotice(result.error);return;}
        operation={draftId:result.draftId!,requestId:crypto.randomUUID()};persist(operation);
      }
      const result=await confirmCalendarSelection(operation.draftId,operation.requestId);
      if(result.error){setNotice(result.error);return;}
      persist(null);setReceipt(result.receiptId!);setUndoKey(null);setPreview(null);setEdits({});
      setNotice('Plan saved. The calendar now shows the saved time blocks.');router.refresh();
    }catch{setNotice('The response was interrupted. Retry confirmation to check the same request safely.');}
  });
  const undo=()=>startTransition(async()=>{
    if(!receipt)return;
    let request=undoKey;
    try{request=request??localStorage.getItem(`${key}:undo:${receipt}`);}catch{}
    request=request??crypto.randomUUID();setUndoKey(request);
    try{localStorage.setItem(`${key}:undo:${receipt}`,request);}catch{}
    try{
      const result=await undoCalendarSelection(receipt,request);
      if(result.error){setNotice(result.error);return;}
      setReceipt(null);setPreview(null);setEdits({});setUndoKey(null);setNotice('Plan undone. Previous task times have been restored.');router.refresh();
    }catch{setNotice('Undo response interrupted. Retry undo to check the same request safely.');}
  });
  const chosen=Object.values(edits).filter(e=>e.selected).length;
  return <div className="space-y-6" aria-busy={busy}>
    <form onSubmit={e=>{e.preventDefault();generate();}} className="flex flex-wrap items-end gap-3">
      <label>First day<input className={`${input} block`} type="date" value={date} required disabled={busy||!!pending} onChange={e=>{setDate(e.target.value);changedWindow();}}/></label>
      <label>Days<input className={`${input} block w-20`} type="number" min={1} max={14} value={days} required disabled={busy||!!pending} onChange={e=>{setDays(Number(e.target.value));changedWindow();}}/></label>
      <label>Work starts<input className={`${input} block`} type="time" value={start} required disabled={busy||!!pending} onChange={e=>{setStart(e.target.value);changedWindow();}}/></label>
      <label>Work ends<input className={`${input} block`} type="time" value={end} required disabled={busy||!!pending} onChange={e=>{setEnd(e.target.value);changedWindow();}}/></label>
      <button type="button" className={input} disabled={busy||!!pending||hoursSaved} onClick={saveHours}>Save work hours</button>
      <button className={input} disabled={busy||!!pending||!hoursSaved}>Generate preview</button>
    </form>
    <p className="text-sm text-slate-600">Save work hours once to use them across devices. They apply to each selected day, including weekends. Changing saved hours invalidates older previews. Five-minute breaks are required. Missing estimates use a labelled 30-minute default. You can save up to 50 changes at once.</p>
    <p role="status" aria-live="polite">{busy?'Working…':notice}</p>
    {pending&&<div className="flex flex-wrap gap-3"><button className={input} disabled={busy} onClick={confirm}>Retry pending confirmation</button><button className={input} disabled={busy} onClick={()=>{persist(null);setPreview(null);setEdits({});setNotice('Pending request cleared locally. Check the calendar for saved changes before making a new plan.');router.refresh();}}>Check calendar and start over</button></div>}
    {!!tasks.length&&<details className="rounded border p-4"><summary className="cursor-pointer font-medium">Protect a task from scheduling</summary><p className="my-3 text-sm text-slate-600">Lock a task to keep its current time, or keep an Inbox task unscheduled. Changing a lock clears the current preview. Unlocking a manually scheduled task does not make it movable automatically.</p><div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1">Task<select aria-label="Task to protect" className={`${input} block w-full`} value={taskId} disabled={busy||!!pending} onChange={e=>setTaskId(e.target.value)}>{tasks.map(task=><option key={task.id} value={task.id}>{task.title}{task.locked?' — Locked':''}</option>)}</select></label><button type="button" className={input} disabled={busy||!!pending||!selectedTask} onClick={changeLock}>{selectedTask?.locked?'Unlock task':'Lock task'}</button></div></details>}
    {preview&&<>
      <SmartCalendarComparison preview={preview} edits={edits}/>
      <h2 className="text-lg font-semibold">Review changes · {chosen} selected</h2>
      <div className="divide-y rounded border">{preview.output.placements.map(p=>{
        const task=preview.tasks.find(t=>t.id===p.schedule_id)!;const edit=edits[p.schedule_id];const suggested=local(p.start_at,preview.timezone);
        const modify=(patch:Partial<Edit>)=>setEdits(current=>({...current,[p.schedule_id]:{...current[p.schedule_id],...patch}}));
        return <article key={p.schedule_id} className="space-y-3 p-4">
          <h3 className="font-medium">{task.title}</h3>
          <p className="text-sm">Before: {task.date?`${task.date} ${task.time?.slice(0,5)??'Unscheduled time'}`:'Inbox'} → Suggested: {suggested.date} {suggested.time} ({(Date.parse(p.end_at)-Date.parse(p.start_at))/60000} min)</p>
          {edit&&<p className="text-sm font-medium">On confirmation: {edit.selected?`${edit.date} ${edit.time} (${edit.minutes} min)`:'Keep original time'}</p>}
          <p className="text-sm text-slate-600">{p.reason_codes.map(schedulingReason).join(' · ')}{p.estimate_source==='default'?' · Provisional estimate: 30 minutes':''}</p>
          {edit?<fieldset disabled={busy||!!pending} className="flex flex-wrap items-end gap-3">
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={edit.selected} onChange={e=>modify({selected:e.target.checked})}/>Save change</label>
            <label className="text-sm">Date<input aria-label={`Date for ${task.title}`} className={`${input} block`} type="date" value={edit.date} onChange={e=>modify({date:e.target.value})}/></label>
            <label className="text-sm">Start ({zone})<input aria-label={`Start for ${task.title}`} className={`${input} block`} type="time" value={edit.time} onChange={e=>modify({time:e.target.value})}/></label>
            <label className="text-sm">Minutes<input aria-label={`Minutes for ${task.title}`} className={`${input} block w-24`} type="number" min={1} max={1440} value={edit.minutes} onChange={e=>modify({minutes:Number(e.target.value)})}/></label>
          </fieldset>:<p className="text-sm">Accepted time preserved.</p>}
        </article>;
      })}</div>
      {preview.tasks.some(t=>t.time||t.locked)&&<details><summary>Fixed and locked tasks</summary><ul className="mt-3 space-y-2">{preview.tasks.filter(t=>(t.time||t.locked)&&!preview.output.placements.some(p=>p.schedule_id===t.id)).map(t=><li key={t.id}>{t.title} — {t.date??'No date'} {t.time?.slice(0,5)??''}{t.locked?' · Locked':''}</li>)}</ul></details>}
      {!!preview.output.unplaced.length&&<section><h2 className="font-semibold">Could not schedule</h2><ul>{preview.output.unplaced.map(p=><li key={p.schedule_id}>{preview.tasks.find(t=>t.id===p.schedule_id)?.title}: {schedulingReason(p.reason_code)}</li>)}</ul></section>}
      {!!preview.output.warnings.length&&<p role="alert">{preview.output.warnings.map(w=>schedulingReason(w.code)).join(' · ')}</p>}
      <button className={`${input} bg-slate-900 text-white`} disabled={busy||!!pending||windowChanged||chosen<1||chosen>50} onClick={confirm}>Confirm {chosen} selected changes</button>
    </>}
    {receipt&&<button className={input} disabled={busy||!!pending} onClick={undo}>Undo latest saved plan</button>}
  </div>;
}
