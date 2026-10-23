import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../../../../lib/integration-api',async()=>{const actual=await vi.importActual<typeof import('../../../../lib/integration-api')>('../../../../lib/integration-api');return {...actual,execute:vi.fn()};});
import {execute} from '../../../../lib/integration-api';
import {GET,POST,PATCH} from './route';
const mocked=vi.mocked(execute),token='ft_'+'a'.repeat(64),id='11111111-1111-4111-8111-111111111111';
const req=(path:string,method='GET',body?:unknown)=>new Request('https://example.test/api/v1/'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const context=(...path:string[])=>({params:Promise.resolve({path})});
beforeEach(()=>{mocked.mockReset();mocked.mockResolvedValue({status:200,data:[]});});
describe('REST routing',()=>{
 it('requires a key',async()=>{expect((await GET(new Request('https://example.test/api/v1/schedules'),context('schedules'))).status).toBe(401);expect(mocked).not.toHaveBeenCalled();});
 it('parses filters without accepting a supplied owner',async()=>{await GET(req('schedules?limit=20&inbox=true'),context('schedules'));expect(mocked).toHaveBeenCalledWith(token,'list_schedules',{limit:20,inbox:true});});
 it('rejects repeated and prototype query parameters',async()=>{expect((await GET(req('schedules?limit=1&limit=2'),context('schedules'))).status).toBe(400);expect((await GET(req('schedules?__proto__=x'),context('schedules'))).status).toBe(400);});
 it('uses the URL id and prohibits a conflicting body id',async()=>{await PATCH(req('schedules/'+id,'PATCH',{expected_updated_at:'2026-10-23T10:00:00Z',is_done:true}),context('schedules',id));expect(mocked).toHaveBeenCalledWith(token,'update_schedule',{id,expected_updated_at:'2026-10-23T10:00:00Z',is_done:true});expect((await PATCH(req('schedules/'+id,'PATCH',{id}),context('schedules',id))).status).toBe(400);});
 it('creates an inbox schedule',async()=>{await POST(req('schedules','POST',{title:'Inbox'}),context('schedules'));expect(mocked).toHaveBeenCalledWith(token,'create_schedule',{title:'Inbox'});});
 it.each([403,409,429,503])('preserves database error status %i',async status=>{mocked.mockResolvedValue({status,error:'Rejected'});const response=await GET(req('profile'),context('profile'));expect(response.status).toBe(status);expect(response.headers.get('cache-control')).toContain('no-store');});
 it('rejects non-object JSON',async()=>{expect((await POST(req('schedules','POST',[]),context('schedules'))).status).toBe(400);});
});
