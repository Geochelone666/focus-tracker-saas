'use client';
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveTimeBlock, type BlockResult } from '@/app/calendar/block-actions';
import { addDays, type Schedule } from '@/lib/planning';
import { conflictingTasks, dayBlockLayout, timestampLabel } from '@/lib/time-blocks';
import { SubmitButton } from './submit-button';

function BlockEditor({task,tasks,date}:{task:Schedule;tasks:Schedule[];date:string}){
 const [state,action]=useActionState(saveTimeBlock,{});
 const [expected,setExpected]=useState(task.updated_at??'');
 useEffect(()=>{if(state.success)setExpected(task.updated_at??'');},[state.success,task.updated_at]);
 return <form action={action} className="mt-3 grid gap-3 rounded border bg-white p-4 sm:grid-cols-2">
  <h3 className="font-semibold sm:col-span-2">Arrange: {task.title}</h3>
  <input type="hidden" name="id" value={task.id}/><input type="hidden" name="expected_updated_at" value={expected}/>
  <input type="hidden" name="series_revisions" value={JSON.stringify(Object.fromEntries(tasks.filter(item=>task.series_id && item.series_id===task.series_id).map(item=>[item.id,item.updated_at])))}/>
  <label className="text-sm">Planned date<input name="date" type="date" defaultValue={task.scheduled_date??date} className="block w-full rounded border p-2"/></label>
  <label className="text-sm">Start time<input name="time" type="time" defaultValue={task.scheduled_time?.slice(0,5)??'14:00'} className="block w-full rounded border p-2"/></label>
  <label className="text-sm">Duration (minutes)<input name="minutes" type="number" min={1} max={1440} defaultValue={task.estimated_minutes??30} className="block w-full rounded border p-2"/></label>
  {task.series_id&&<label className="text-sm">Edit scope<select name="scope" className="block w-full rounded border p-2"><option value="one">Only this occurrence</option><option value="future">This and future unfinished</option></select></label>}
  <p className="text-xs sm:col-span-2">Deadline: {task.deadline??'None'}. Changing this block keeps the deadline. Clear both planned date and time to return to Inbox.</p>
  <SubmitButton label="Save time block"/>
  {state.error&&<p role="alert" className="break-words text-red-800 sm:col-span-2">{state.error}</p>}{state.success&&<p role="status" className="sm:col-span-2">{state.success}</p>}
 </form>;
}
export function TimeBlockCalendar({tasks,date,view,zone}:{tasks:Schedule[];date:string;view:'day'|'week';zone:string}){
 const router=useRouter(),[selected,setSelected]=useState(''),[result,setResult]=useState<BlockResult>({}),[pending,startTransition]=useTransition();
 const offset=(new Date(`${date}T12:00:00Z`).getUTCDay()+6)%7;
 const dates=Array.from({length:view==='week'?7:1},(_,i)=>addDays(date,view==='week'?i-offset:0));
 const live=tasks.filter(task=>!task.deleted_at),inbox=live.filter(task=>!task.scheduled_date&&!task.is_done);
 const chosen=live.find(task=>task.id===selected);
 function drop(event:React.DragEvent<HTMLElement>,day:string){
  event.preventDefault();
  try{
   const payload=JSON.parse(event.dataTransfer.getData('application/x-focus-task'));
   const task=live.find(item=>item.id===payload.id);if(!task||task.is_done)return;
   const rect=event.currentTarget.getBoundingClientRect();const minute=Math.min(1425,Math.max(0,Math.round((event.clientY-rect.top)/.8/15)*15));
   const form=new FormData();form.set('id',task.id);form.set('expected_updated_at',task.updated_at??'');
   let start=minute,duration=task.estimated_minutes??30;
   if(payload.kind==='resize'){
    if(task.scheduled_date!==day||!task.scheduled_time)return;
    start=Number(task.scheduled_time.slice(0,2))*60+Number(task.scheduled_time.slice(3,5));duration=Math.max(15,minute-start);
   }
   form.set('date',day);form.set('time',`${String(Math.floor(start/60)).padStart(2,'0')}:${String(start%60).padStart(2,'0')}`);form.set('minutes',String(duration));
   startTransition(async()=>{const saved=await saveTimeBlock({},form);setResult(saved);if(!saved.error)router.refresh();});
  }catch{setResult({error:'Could not move this task. Use the editor below.'});}
 }
 function drag(event:React.DragEvent,id:string,kind='move'){event.dataTransfer.setData('application/x-focus-task',JSON.stringify({id,kind}));event.dataTransfer.effectAllowed='move';}
 return <section className="my-6 min-w-0" aria-label={`${view} time blocking`}>
  <p className="mb-3 text-sm">Times follow {zone}. Drag an Inbox task onto the timeline, move a block, or drag its Resize handle. The editor provides the same operations with keyboard or touch. Overlaps are allowed. DST dates show elapsed durations; repeated start times use the first occurrence.</p>
  <div className="mb-3 flex flex-wrap gap-2"><label className="text-sm">Arrange task<select aria-label="Arrange task" value={selected} onChange={e=>setSelected(e.target.value)} className="ml-2 max-w-full rounded border p-2"><option value="">Choose a task</option>{live.filter(task=>!task.is_done).map(task=><option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
   {inbox.map(task=><button key={task.id} draggable onDragStart={event=>drag(event,task.id)} onClick={()=>setSelected(task.id)} className="max-w-full break-words rounded border px-3 py-2 text-sm">Inbox: {task.title}</button>)}
  </div>
  {result.error&&<p role="alert" className="my-2 text-red-800">{result.error}</p>}{result.success&&<p role="status" className="my-2">{result.success}</p>}{pending&&<p role="status">Saving block…</p>}
  {chosen&&<BlockEditor key={chosen.id} task={chosen} tasks={tasks} date={date}/>}
  <div className="mt-3 overflow-x-auto rounded border bg-white"><div style={{minWidth:view==='week'?1120:280}} className="flex">
   <div className="w-12 shrink-0 pt-9" aria-hidden="true">{Array.from({length:24},(_,h)=><div key={h} className="h-12 text-xs text-slate-500">{String(h).padStart(2,'0')}:00</div>)}</div>
   {dates.map(day=>{
    const layout=dayBlockLayout(live,day,zone);
    return <div key={day} className="min-w-0 flex-1 border-l"><h3 className="h-9 p-2 text-sm font-semibold">{day}{layout.dst ? " · DST" : ""}</h3>
     <div className="relative h-[1152px]" onDragOver={event=>event.preventDefault()} onDrop={event=>drop(event,day)} aria-label={`Timeline ${day}`}>
      {Array.from({length:24},(_,h)=><div key={h} className="pointer-events-none absolute w-full border-t border-slate-100" style={{top:h*48}}/>)}
      {layout.segments.map(({task,interval,top,height,lane,continued,carries})=>{
       const conflicts=conflictingTasks(task,live,zone),lanes=layout.lanes;
       return <article key={task.id} draggable={!task.is_done} onDragStart={event=>drag(event,task.id)} className={`absolute overflow-hidden rounded border p-1 text-xs ${task.is_done?'border-slate-300 bg-slate-100':'border-blue-400 bg-blue-50'}`}
        style={{top:top*.8,height:Math.max(32,height*.8),left:`${lane*100/lanes}%`,width:`${100/lanes}%`}}>
        <button onClick={()=>setSelected(task.id)} className="w-full break-words text-left font-semibold underline">{task.title}</button>
        <p>{continued ? "Continued · " : ""}{task.scheduled_time?.slice(0,5)}–{interval?timestampLabel(interval.end,zone):'?'} · {task.estimated_minutes??'?'}m{carries ? " · continues tomorrow" : ""}</p>
        {conflicts.length>0&&<p role="status" className="text-amber-900">Overlaps {conflicts.length} task(s)</p>}
        {interval?.ambiguous&&<p>Repeated time: first occurrence</p>}
        {!interval&&<p className="text-amber-900">Check time / duration</p>}
        {!task.is_done&&<button draggable onDragStart={event=>{event.stopPropagation();drag(event,task.id,'resize');}} onClick={()=>setSelected(task.id)} aria-label={`Resize ${task.title}`} className="absolute bottom-0 left-0 w-full cursor-ns-resize border-t bg-blue-50 text-left">Resize / edit</button>}
       </article>;
      })}
     </div>
    </div>;
   })}
  </div></div>

 </section>;
}
