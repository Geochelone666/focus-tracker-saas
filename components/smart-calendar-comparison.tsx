'use client';
import { useEffect,useRef,useState } from 'react';
import { validDate } from '@/lib/calendar';
import type { LivePreview } from '@/lib/smart-scheduler/live-preview';
import { calendarComparisonDay,compareCalendarPlan,type ComparisonBlock,type PlanEdit } from '@/lib/smart-scheduler/plan-comparison';
function Timeline({blocks,date,zone,label}:{blocks:ComparisonBlock[];date:string;zone:string;label:string}){
  const day=calendarComparisonDay(blocks,date,zone),scroll=useRef<HTMLDivElement>(null);
  const time=(instant:number)=>new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',timeZoneName:'shortOffset'}).format(new Date(instant));
  const firstOffset=useRef(540);firstOffset.current=day.segments[0]?.offsetMinutes??540;
  useEffect(()=>{if(scroll.current)scroll.current.scrollTop=Math.max(0,firstOffset.current-60);},[date]); // Scroll on day changes, not during edits.
  return <section aria-label={`${label} timeline`} className="min-w-0">
    <h3 className="mb-2 font-medium">{label}</h3>
    <div ref={scroll} tabIndex={0} aria-label={`${label} scrollable day timeline`} className="max-h-96 overflow-auto rounded border bg-white">
      <div className="relative ml-24 mr-1" style={{height:day.minutes}}>
        {Array.from({length:Math.ceil(day.minutes/60)},(_,i)=><div key={i} className="absolute left-0 right-0 border-t border-slate-200" style={{top:i*60}}><span className="absolute -left-24 w-24 px-1 text-xs text-slate-600">{time(day.start+i*3600000)}</span></div>)}
        {day.segments.map(block=><div key={block.id} title={`${block.title}: ${time(block.start)}–${time(block.end)}`} aria-label={`${block.title}, ${time(block.start)} to ${time(block.end)}${block.locked?', locked':''}`} className={`absolute overflow-hidden rounded border px-1 py-1 text-xs ${block.changed?'border-dashed border-indigo-600 bg-indigo-50 text-indigo-950':'border-slate-300 bg-slate-100 text-slate-800'}`} style={{top:block.offsetMinutes,height:Math.max(4,block.minutes),left:`${block.lane/day.lanes*100}%`,width:`${100/day.lanes}%`}}><strong className="block truncate">{block.title}</strong><span>{time(block.start)}–{time(block.end)}</span>{block.locked&&<span className="block">Locked</span>}</div>)}
      </div>
    </div>
    {!day.segments.length&&<p className="mt-2 text-sm text-slate-600">No time blocks on this day.</p>}
  </section>;
}
export function SmartCalendarComparison({preview,edits}:{preview:LivePreview;edits:Record<string,PlanEdit>}){
  const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:preview.timezone,year:'numeric',month:'2-digit',day:'2-digit'});
  const dates=[...new Set([...preview.availability.map(w=>dayFormatter.format(new Date(w.start_at))),...Object.values(edits).filter(e=>e.selected&&validDate(e.date)).map(e=>e.date)])].sort();
  const [chosen,setChosen]=useState(dates[0]),[mobile,setMobile]=useState<'before'|'after'>('after');
  const date=dates.includes(chosen)?chosen:dates[0];
  const comparison=compareCalendarPlan(preview,edits);
  return <section aria-label="Calendar plan comparison" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Compare your day</h2><label className="text-sm">View date<select aria-label="Comparison date" className="ml-2 min-h-11 rounded border p-2" value={date} onChange={e=>setChosen(e.target.value)}>{dates.map(d=><option key={d}>{d}</option>)}</select></label></div>
    <p className="text-sm text-slate-600">Solid blocks keep their time. Dashed blocks show selected edits. Unselected tasks keep their original time. Clock offsets distinguish repeated hours.</p>
    <div role="group" aria-label="Mobile comparison view" className="flex gap-2 md:hidden"><button type="button" aria-pressed={mobile==='before'} onClick={()=>setMobile('before')} className="min-h-11 rounded border px-3">Original plan</button><button type="button" aria-pressed={mobile==='after'} onClick={()=>setMobile('after')} className="min-h-11 rounded border px-3">After selection</button></div>
    <div className="grid gap-4 md:grid-cols-2"><div className={mobile==='before'?'min-w-0':'hidden min-w-0 md:block'}><Timeline blocks={comparison.before} date={date} zone={preview.timezone} label="Original plan"/></div><div className={mobile==='after'?'min-w-0':'hidden min-w-0 md:block'}><Timeline blocks={comparison.after} date={date} zone={preview.timezone} label="After selection"/></div></div>
    {!!Object.keys(comparison.issues).length&&<div role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm"><p className="font-medium">Review these edits before confirming:</p><ul className="list-disc pl-5">{Object.entries(comparison.issues).flatMap(([id,messages])=>messages.map(message=><li key={`${id}:${message}`}>{preview.tasks.find(t=>t.id===id)?.title}: {message}</li>))}</ul><p className="mt-2">Saving checks all tasks and deadlines again.</p></div>}
  </section>;
}
