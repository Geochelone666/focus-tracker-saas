/**
 * F2-A03: reviewed, read-only translation to PR #69's local wall-time RPC fields.
 * This does NOT call the RPC, grant permissions, confirm a plan or bypass
 * backend F2-B03's required transactional revalidation.
 */
import { timezone } from '../planning';
import { wallTimeInstants } from '../wall-time';
import type { SmartCalendarOutputV01, SmartCalendarPlacementV01 } from './focus-adapter';

export type LegacyBatchChange = {
  id:string;expected_updated_at:string;
  scheduled_date:string;scheduled_time:string;estimated_minutes:number;
};
export type LegacyWireErrorCode =
  'INVALID_ZONE'|'UNREPRESENTABLE_WALL_START'|'INVALID_PROPOSAL'|
  'BATCH_LIMIT_EXCEEDED'|'UNSUPPORTED_REMOVAL';
export class LegacyWireError extends Error {
  constructor(readonly code:LegacyWireErrorCode,message:string){super(message);this.name='LegacyWireError';}
}
const formatter=(zone:string)=>new Intl.DateTimeFormat('en-CA',{
  timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23',
});
/** Demonstrates the precise backend wall-time round-trip, including later-fold policy. */
export function placementToLegacyBatchChange(
  placement:SmartCalendarPlacementV01,ianaZone:string,
):LegacyBatchChange {
  if(timezone(ianaZone)!==ianaZone)throw new LegacyWireError('INVALID_ZONE','Invalid IANA zone');
  const start=Date.parse(placement.start_at),end=Date.parse(placement.end_at);
  const duration=(end-start)/60000;
  if(!placement.schedule_id||!placement.expected_updated_at||placement.locked!==false||
    !Number.isFinite(start)||!Number.isFinite(end)||start%60000!==0||
    !Number.isInteger(duration)||duration<1||duration>1440)
    throw new LegacyWireError('INVALID_PROPOSAL','Invalid candidate placement or duration');
  const parts=formatter(ianaZone).formatToParts(new Date(start));
  const value=(type:string)=>parts.find(p=>p.type===type)?.value;
  const day=[value('year'),value('month'),value('day')].join('-');
  const clock=`${value('hour')}:${value('minute')}`;
  const instants=wallTimeInstants(day,clock,ianaZone);
  // PR #69 SQL selects later fold and has no explicit UTC/fold discriminant.
  if(instants.at(-1)!==start)
    throw new LegacyWireError('UNREPRESENTABLE_WALL_START',
      'Proposed UTC start cannot be encoded by current local-time RPC; refresh with a restricted window');
  return {id:placement.schedule_id,expected_updated_at:placement.expected_updated_at,
    scheduled_date:day,scheduled_time:clock,estimated_minutes:duration};
}
/**
 * Produce a candidate batch for backend review only. Do not split >50 changes;
 * the existing RPC is not a versioned multi-batch commit with an undo receipt.
 */
export function changedPlacementsToLegacyBatch(
  output:SmartCalendarOutputV01,ianaZone:string,
):LegacyBatchChange[] {
  const changes=output.changes.filter(x=>JSON.stringify(x.before)!==JSON.stringify(x.after));
  if(changes.some(x=>x.after===null))
    throw new LegacyWireError('UNSUPPORTED_REMOVAL','Current batch RPC cannot clear a placement');
  if(changes.length>50)
    throw new LegacyWireError('BATCH_LIMIT_EXCEEDED','Current atomic batch RPC supports at most 50 changes');
  const changedIds=new Set(changes.map(x=>x.schedule_id));
  const selected=output.placements.filter(x=>changedIds.has(x.schedule_id));
  if(selected.length!==changedIds.size)
    throw new LegacyWireError('INVALID_PROPOSAL','Not all changes have placements');
  return selected.map(x=>placementToLegacyBatchChange(x,ianaZone));
}
