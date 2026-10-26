import { createClient } from '@supabase/supabase-js';
import { getRequiredEnvVar } from './env';

export const fields = {
  title: { type: 'string', minLength: 1, maxLength: 120 },
  scheduled_date: { type: ['string','null'], format: 'date' },
  scheduled_time: { type: ['string','null'], pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$' },
  deadline: { type: ['string','null'], format: 'date' },
  notes: { type: ['string','null'], maxLength: 2000 },
  priority: { type: 'string', enum: ['low','normal','high'] },
  estimated_minutes: { type: ['integer','null'], minimum: 1, maximum: 1440 },
  energy: { type: ['string','null'], enum: ['low','medium','high',null] },
  project_id: { type: ['string','null'], format: 'uuid' },
  skill_id: { type: ['string','null'], format: 'uuid' },
  is_done: { type: 'boolean' }
};
export const operations = {
  list_schedules: { description: 'List schedules, ordered by calendar date then id. Dates/times use the account timezone. Default excludes trash. Paginate with offset until an empty page.', properties: { from: {type:'string',format:'date'}, to: {type:'string',format:'date'}, inbox:{type:'boolean'}, trash:{type:'boolean'}, is_done:{type:'boolean'}, limit:{type:'integer',minimum:1,maximum:100}, offset:{type:'integer',minimum:0} }, required: [] as string[] },
  get_schedule: { description: 'Get one schedule, including its updated_at revision. Read before editing.', properties: {id:{type:'string',format:'uuid'}}, required:['id'] },
  list_projects: { description: 'List owned projects, 100 per page. Increase offset until empty.', properties:{offset:{type:'integer',minimum:0}}, required:[] as string[] },
  list_skills: { description: 'List owned skill IDs and names, 100 per page. Use IDs when linking a schedule to a skill.', properties:{offset:{type:'integer',minimum:0}}, required:[] as string[] },
  get_profile: { description: 'Read account timezone and daily focus target. Interpret all schedule dates and wall times in this timezone.', properties:{}, required:[] as string[] },
  create_schedule: { description: 'Create one schedule, optionally with a deadline. Omit date/time for inbox. A time requires a date. Creates a single occurrence; no recurrence expansion. Confirm the user intent before writing. Do not retry blindly after a network timeout: check for an existing schedule first.', properties:fields, required:['title'] },
  update_schedule: { description: 'Edit one occurrence, including its deadline; mark complete, move to trash (trashed=true), or restore (trashed=false). First fetch the schedule and supply its exact updated_at as expected_updated_at. On conflict, read again and ask before overwriting. Trash is reversible; no permanent deletion. Ask before removing tasks or making broad changes.', properties:{...fields,id:{type:'string',format:'uuid'},expected_updated_at:{type:'string',format:'date-time'},trashed:{type:'boolean'}}, required:['id','expected_updated_at'] }
};
export type Operation = keyof typeof operations;
export function schema(operation: Operation) {
  const value = operations[operation];
  return {type:'object',properties:value.properties,required:value.required,additionalProperties:false};
}
export function validInput(operation: Operation, data: unknown): data is Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const value = data as Record<string, unknown>;
  const definition = operations[operation];
  if (definition.required.some(key => value[key] === undefined || value[key] === null)) return false;
  return Object.entries(value).every(([key,item]) => {
    const rule = (definition.properties as Record<string, Record<string, unknown>>)[key];
    if (!rule) return false;
    const types = Array.isArray(rule.type) ? rule.type : [rule.type];
    const type = item === null ? 'null' : typeof item === 'number' && Number.isInteger(item) ? 'integer' : typeof item;
    if (!types.includes(type)) return false;
    if (Array.isArray(rule.enum) && !rule.enum.includes(item)) return false;
    if (typeof item === 'string') {
      if (typeof rule.minLength === 'number' && item.trim().length < rule.minLength) return false;
      if (typeof rule.maxLength === 'number' && item.length > rule.maxLength) return false;
      if (typeof rule.pattern === 'string' && !new RegExp(rule.pattern).test(item)) return false;
      if (rule.format === 'uuid' && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item)) return false;
      if (rule.format === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(item) || !Number.isFinite(Date.parse(item)) || new Date(item).toISOString().slice(0,10) !== item || item < '0002-01-01' || item > '9998-12-31')) return false;
      if (rule.format === 'date-time' && (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(item) || !Number.isFinite(Date.parse(item)))) return false;
    }
    if (typeof item === 'number' && ((typeof rule.minimum === 'number' && item < rule.minimum) || (typeof rule.maximum === 'number' && item > rule.maximum))) return false;
    return true;
  });
}
export function bearer(request: Request) { return /^Bearer (ft_[a-f0-9]{64})$/.exec(request.headers.get('authorization') ?? '')?.[1]; }
export function json(body: unknown, status = 200) {
  return Response.json(body,{status,headers:{'Cache-Control':'private, no-store',...(status===401?{'WWW-Authenticate':'Bearer realm="Focus Tracker"'}:{}),...(status===429?{'Retry-After':'60'}:{})}});
}
export async function execute(token: string, operation: Operation, data: unknown) {
  if (!validInput(operation,data)) return {status:400,error:'Invalid fields. See the OpenAPI schema.'};
  // A fresh anonymous client: bearer keys are checked by a restricted DB function,
  // never by a service-role client or an unrelated browser session.
  try {
  const client = createClient(getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_URL'),getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const {data: result,error} = await client.rpc('integration_api',{p_token:token,p_operation:operation,p_data:data});
  if (error || !result) return {status:503,error:'Integration unavailable. Check migration 20261023000000 and retry later.'};
  return result as {status:number;data?:unknown;error?:string};
  } catch { return {status:503,error:'Integration unavailable. Please try again later.'}; }
}
export async function readBody(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new Error('Use application/json');
  const reader=request.body?.getReader(); if (!reader) throw new Error('Missing JSON body');
  let size=0; const parts:Uint8Array[]=[];
  while (true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>16384){await reader.cancel();throw new Error('Body exceeds 16 KB');} parts.push(value); }
  return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
}
