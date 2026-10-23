import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../../lib/integration-api',async()=>{const actual=await vi.importActual<typeof import('../../../lib/integration-api')>('../../../lib/integration-api');return {...actual,execute:vi.fn()};});
import {execute} from '../../../lib/integration-api';
import {POST,GET} from './route';
const mocked=vi.mocked(execute);
const req=(body:unknown,auth=true)=>new Request('https://example.test/api/mcp',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer ft_'+'a'.repeat(64)}:{})},body:JSON.stringify(body)});
beforeEach(()=>{mocked.mockReset();mocked.mockResolvedValue({status:200,data:{timezone:'America/New_York'}});});
describe('MCP protocol and authentication',()=>{
 it('rejects foreign browser origins',async()=>{const request=req({jsonrpc:'2.0',id:1,method:'ping'});request.headers.set('origin','https://foreign.test');expect((await POST(request)).status).toBe(403);expect(mocked).not.toHaveBeenCalled();});
 it('requires authentication',async()=>{expect((await POST(req({jsonrpc:'2.0',id:1,method:'tools/list'},false))).status).toBe(401);expect(mocked).not.toHaveBeenCalled();});
 it('rejects revoked keys even on discovery',async()=>{mocked.mockResolvedValue({status:401,error:'Revoked'});expect((await POST(req({jsonrpc:'2.0',id:1,method:'tools/list'}))).status).toBe(401);});
 it('negotiates version and advertises tools',async()=>{const init=await (await POST(req({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26'}}))).json();expect(init.result.protocolVersion).toBe('2025-03-26');const list=await (await POST(req({jsonrpc:'2.0',id:2,method:'tools/list'}))).json();expect(list.result.tools).toHaveLength(6);});
 it('returns permission failures as tool errors',async()=>{mocked.mockResolvedValueOnce({status:200,data:{}}).mockResolvedValueOnce({status:403,error:'Read only'});const result=await (await POST(req({jsonrpc:'2.0',id:'call',method:'tools/call',params:{name:'create_schedule',arguments:{title:'Task'}}}))).json();expect(result.result.isError).toBe(true);expect(result.id).toBe('call');});
 it('rejects unknown tools and inherited property names',async()=>{const result=await (await POST(req({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'toString'}}))).json();expect(result.error.code).toBe(-32602);});
 it('acknowledges notifications and rejects SSE',async()=>{expect((await POST(req({jsonrpc:'2.0',method:'notifications/initialized'}))).status).toBe(202);expect(GET().status).toBe(405);});
});
