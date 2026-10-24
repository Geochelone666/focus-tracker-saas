import {describe,it,expect} from 'vitest';
import {draftFor,localDay,parseDraft} from '../mobile/src/plans';
describe('native schedule model',()=>{
 it('creates title-only inbox tasks',()=>{expect(parseDraft({...draftFor(),title:'Read'})).toMatchObject({title:'Read',scheduled_date:null,scheduled_time:null,notes:null});});
 it.each([{date:'2026-02-30'},{date:'2026-10-23',time:'24:00'},{time:'09:00'},{estimate:'0'},{estimate:'1.5'},{priority:'urgent'}])('rejects invalid input %j',patch=>{expect(()=>parseDraft({...draftFor(),title:'Read',...patch})).toThrow();});
 it('preserves local dates without converting them to UTC',()=>{expect(parseDraft({...draftFor(),title:'Read',date:'2026-10-23',time:'09:00'})).toMatchObject({scheduled_date:'2026-10-23',scheduled_time:'09:00'});});
 it('uses the account timezone for Today',()=>{expect(localDay('America/New_York',new Date('2026-10-23T02:00:00Z'))).toBe('2026-10-22');expect(localDay('Asia/Shanghai',new Date('2026-10-23T02:00:00Z'))).toBe('2026-10-23');});
});
