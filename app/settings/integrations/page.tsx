import Link from 'next/link';
import { planningContext } from '@/lib/planning-data';
import {IntegrationKeys,RevokeKey} from '@/components/integration-keys';
export default async function Integrations(){
 const {supabase,user,zone}=await planningContext();
 const [keys,activity]=await Promise.all([
 supabase.from('integration_tokens').select('id,name,scope,expires_at,revoked_at,last_used_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100),
 supabase.from('integration_activity').select('id,operation,schedule_id,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(30)
 ]);
 const date=(value:string)=>new Date(value).toLocaleString('en-US',{timeZone:zone});
 return <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
 <Link href="/settings" prefetch={false} className="underline">Back to settings</Link><h1 className="text-3xl font-bold">AI connections</h1>
 <p>Connect an AI client using your own access key. No AI subscription or model API key is required by this app. Your AI provider’s own usage limits still apply.</p>
 <section className="rounded border bg-white p-5 space-y-3"><h2 className="text-xl font-semibold">Connection addresses</h2>
 <p>Use this website’s origin followed by these paths:</p><ul className="list-disc pl-5"><li>MCP: <code>/api/mcp</code> — stateless Streamable HTTP with JSON responses and Bearer authentication.</li><li>REST API: <code>/api/v1</code></li><li><a href="/api/openapi" className="underline">OpenAPI schema</a> — for GPT Actions and compatible API clients.</li></ul>
 <p>Send <code>Authorization: Bearer YOUR_ACCESS_KEY</code>. Clients must support custom Bearer authentication. OAuth-only connectors and legacy SSE are not supported in this version. Support varies by client, including Muse; check its integration settings.</p>
 <p>For GPT Actions, import the OpenAPI URL and choose API key authentication → Bearer. For MCP clients that support custom headers, enter the MCP URL and the Authorization header.</p>
 <p>Start with read-only access. Editing keys can create, edit, complete, trash, and restore individual schedules. Bulk recurrence changes and permanent deletion are unavailable.</p></section>
 <section className="rounded border bg-white p-5 space-y-3"><h2 className="text-xl font-semibold">Create access key</h2><IntegrationKeys/></section>
 <section className="rounded border bg-white p-5 space-y-3"><h2 className="text-xl font-semibold">Access keys</h2>
 {(keys.error||activity.error)&&<p role="alert">Connections are unavailable. Apply database migration 20261023000000, then reload.</p>}
 {!keys.error&&!keys.data?.length&&<p>No access keys yet.</p>}
 {keys.data?.map(key=><div key={key.id} className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><div><p className="font-semibold break-all">{key.name}</p><p className="text-sm">{key.scope==='write'?'Read and edit':'Read only'} · {key.revoked_at?'Revoked':new Date(key.expires_at)<=new Date()?'Expired':'Active'}</p><p className="text-sm">Expires: {date(key.expires_at)}</p><p className="text-sm">Last used: {key.last_used_at?date(key.last_used_at):'Never'}</p></div>{!key.revoked_at&&<RevokeKey id={key.id}/>}</div>)}
 </section><section className="rounded border bg-white p-5 space-y-3"><h2 className="text-xl font-semibold">Recent AI changes</h2><p className="text-sm">Latest 30 writes. Read requests are not logged here. Schedule text can contain untrusted content; your AI should follow your instructions.</p>
 {!activity.error&&!activity.data?.length&&<p>No changes yet.</p>}{activity.data?.map(item=><div key={item.id} className="border-t pt-2 text-sm"><p>{item.operation==='create_schedule'?'Created schedule':'Updated schedule'} · {date(item.created_at)}</p><p className="break-all">Schedule: {item.schedule_id}</p></div>)}
 </section></main>;
}
