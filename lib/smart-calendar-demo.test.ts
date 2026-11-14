import {describe,it,expect} from 'vitest';
import {DAY,EXAMPLE,FIXED,initialDecisions,selectedSlot,conflictMap,sameSlot} from './smart-calendar-demo';
describe('Smart Calendar preview fixture (never persists)',()=>{
 it('includes fixed and unplaced work',()=>{expect(FIXED).toHaveLength(2);expect(EXAMPLE.some(t=>t.proposed===null)).toBe(true);});
 it('keeps locked and rejected tasks unchanged',()=>{const d=initialDecisions();expect(selectedSlot(EXAMPLE[4],d)).toEqual(EXAMPLE[4].current);d.accepted.abstract=false;expect(selectedSlot(EXAMPLE[0],d)).toEqual(EXAMPLE[0].current);});
 it('supports manual override without mutating the fixture',()=>{const d=initialDecisions();const original=EXAMPLE[0].proposed;d.manual.abstract={day:DAY,start:'16:00',minutes:45};expect(selectedSlot(EXAMPLE[0],d)).toEqual(d.manual.abstract);expect(EXAMPLE[0].proposed).toBe(original);expect(sameSlot(EXAMPLE[0].current,original)).toBe(false);});
 it('detects and clears fixed conflicts',()=>{const d=initialDecisions();expect(conflictMap(EXAMPLE,d).physics).toContain('Overlaps Fixed seminar');d.manual.physics={day:DAY,start:'16:00',minutes:60};expect(conflictMap(EXAMPLE,d).physics).toBeUndefined();});
 it('detects proposed hours outside the window',()=>{const d=initialDecisions();d.manual.abstract={day:DAY,start:'08:00',minutes:60};expect(conflictMap(EXAMPLE,d).abstract).toContain('Outside available hours 09:00–17:00');});
});