import { bearer, execute, json, readBody, type Operation } from '../../../../lib/integration-api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{path:string[]}>};
async function handle(request:Request,context:Context) {
  const token=bearer(request); if(!token) return json({error:'A bearer access key is required'},401);
  const {path}=await context.params; let operation:Operation;
  let data:Record<string,unknown>={};
  try {
    if(request.method==='GET') {
      if(path.length===1 && path[0]==='schedules') operation='list_schedules';
      else if(path.length===2 && path[0]==='schedules') {operation='get_schedule';data.id=path[1];}
      else if(path.length===1 && path[0]==='projects') operation='list_projects';
      else if(path.length===1 && path[0]==='profile') operation='get_profile';
      else return json({error:'Not found'},404);
      for(const [key,value] of new URL(request.url).searchParams) {
        if(key==='id' || key in data) return json({error:'Duplicate or invalid query parameter'},400);
        data[key]=['limit','offset'].includes(key)?Number(value):['trash','inbox','is_done'].includes(key)?value==='true'?true:value==='false'?false:value:value;
      }
    } else {
      if(path[0]!=='schedules' || (request.method==='POST'?path.length!==1:path.length!==2)) return json({error:'Not found'},404);
      const body=await readBody(request);
      if(!body || typeof body!=='object' || Array.isArray(body)) return json({error:'Expected an object'},400);
      data=body as Record<string,unknown>;
      operation=request.method==='POST'?'create_schedule':'update_schedule';
      if(request.method==='PATCH') {if('id' in data) return json({error:'Use the id in the URL'},400);data.id=path[1];}
    }
    const result=await execute(token,operation,data); return json(result.error?{error:result.error}:{data:result.data},result.status);
  } catch {return json({error:'Invalid request or integration unavailable'},400);}
}
export const GET=handle;export const POST=handle;export const PATCH=handle;
