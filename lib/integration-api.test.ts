import {describe,it,expect} from 'vitest';
import {validInput,bearer,readBody} from './integration-api';
describe('AI boundary validation',()=>{
 it('accepts inbox capture and empty list filters',()=>{expect(validInput('create_schedule',{title:'Read a book'})).toBe(true);expect(validInput('list_schedules',{})).toBe(true);});
 it.each([{title:''},{title:'x',user_id:'other'},{title:'x',estimated_minutes:0},{title:'x',estimated_minutes:1.5},{title:'x',scheduled_date:'2026-02-30'},{title:'x',scheduled_time:'24:00'},{title:'x',project_id:'bad'},{title:'x',is_done:'true'},null,[]])('rejects invalid or privileged input %j',value=>expect(validInput('create_schedule',value)).toBe(false));
 it('requires an id and a precise revision for updates',()=>{expect(validInput('update_schedule',{id:'11111111-1111-4111-8111-111111111111',expected_updated_at:'2026-10-23T10:00:00.123456+00:00',trashed:true})).toBe(true);expect(validInput('update_schedule',{id:'11111111-1111-4111-8111-111111111111',is_done:true})).toBe(false);});
 it('rejects credentials in URLs and malformed headers',()=>{expect(bearer(new Request('https://example.test?token=ft_'+'a'.repeat(64)))).toBeUndefined();expect(bearer(new Request('https://example.test',{headers:{authorization:'Bearer ft_'+'a'.repeat(64)}}))).toBe('ft_'+'a'.repeat(64));});
 it('bounds pagination and rejects unexpected filters',()=>{expect(validInput('list_schedules',{limit:101})).toBe(false);expect(validInput('list_schedules',{offset:-1})).toBe(false);expect(validInput('list_schedules',{token:'bad'})).toBe(false);});
 it('lets AI list owner skills and use task deadlines without privileged fields',()=>{
  expect(validInput('list_skills',{})).toBe(true);
  expect(validInput('list_skills',{offset:100})).toBe(true);
  expect(validInput('list_skills',{offset:-2})).toBe(false);
  expect(validInput('list_skills',{user_id:'forged'})).toBe(false);
  expect(validInput('create_schedule',{title:'Finish chapter',deadline:'2026-11-03'})).toBe(true);
  expect(validInput('update_schedule',{id:'11111111-1111-4111-8111-111111111111',expected_updated_at:'2026-10-23T10:00:00Z',deadline:null})).toBe(true);
  expect(validInput('create_schedule',{title:'Invalid deadline',deadline:'2026-02-29'})).toBe(false);
 });
 it('bounds streamed body size',async()=>{await expect(readBody(new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({notes:'a'.repeat(17000)})}))).rejects.toThrow('16 KB');});
});
