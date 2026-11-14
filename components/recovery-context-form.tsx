'use client';
import {useActionState,useEffect,useState} from 'react';
import {saveRecoveryContext} from '@/app/calendar/recovery/actions';
import type {RecoveryTask} from '@/lib/execution-recovery';
import {SubmitButton} from './submit-button';
export function RecoveryContextForm({task}:{task:RecoveryTask}){
 // Keep the original revision alongside the draft until this exact form saves.
 const [expected,setExpected]=useState(task.updated_at);
 const [remaining,setRemaining]=useState(task.remaining_minutes?.toString()??'');
 const [note,setNote]=useState(task.resume_note??'');
 const [result,action,pending]=useActionState(saveRecoveryContext,{});
 useEffect(()=>{if(result.revision)setExpected(result.revision);},[result.revision]);
 return <form action={action} className="space-y-3">
  <input type="hidden" name="id" value={task.id}/><input type="hidden" name="expected_updated_at" value={result.revision??expected}/>
  <fieldset disabled={pending} className="space-y-3">
   <label className="block text-sm">Your remaining estimate (minutes)<input name="remaining_minutes" type="number" min={1} max={1440} value={remaining} onChange={e=>setRemaining(e.target.value)} className="mt-1 block w-32 rounded border p-2"/></label>
   <label className="block text-sm">Where to pick up next<textarea name="resume_note" maxLength={2000} rows={3} value={note} onChange={e=>setNote(e.target.value)} className="mt-1 block w-full rounded border p-2"/></label>
   <p className="text-xs text-slate-600">Leave remaining time blank if unknown. Focus time does not prove task completion. This estimate is a recovery note; it does not change your original estimate or reschedule the task.</p>
   <SubmitButton label="Save recovery context" pendingLabel="Saving…"/>
  </fieldset>
  {result.error&&<p role="alert" className="text-sm text-red-800">{result.error}</p>}{result.success&&<p role="status" className="text-sm">{result.success}</p>}
 </form>;
}
