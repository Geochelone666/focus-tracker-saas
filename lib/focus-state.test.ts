import { describe, expect, it } from 'vitest';
import { focusElapsedMs, focusOptions, type FocusSession } from './focus-state';
const start = Date.parse('2026-11-01T05:50:00Z');
const session: FocusSession = { id:'id', started_at:new Date(start).toISOString(), skill_id:null, schedule_id:null,
  focus_mode:'elapsed', target_seconds:null, focus_status:'running', accumulated_ms:1234, resumed_at:new Date(start).toISOString(), focus_revision:0 };
describe('recoverable focus clock', () => {
  it('derives elapsed time from timestamps across a backgrounded hour and DST fallback', () => {
    expect(focusElapsedMs(session,start+3600000)).toBe(3601234);
  });
  it('excludes ten minutes of pause, including after reload', () => {
    const paused = {...session,focus_status:'paused' as const,resumed_at:null,accumulated_ms:60000};
    expect(focusElapsedMs(paused,start+600000)).toBe(60000);
    expect(focusElapsedMs(JSON.parse(JSON.stringify(paused)),start+1200000)).toBe(60000);
  });
  it('keeps subsecond fragments over pause/resume and caps expired countdowns', () => {
    expect(focusElapsedMs({...session,accumulated_ms:1999},start+1)).toBe(2000);
    expect(focusElapsedMs({...session,focus_mode:'countdown',target_seconds:1500},start+3600000)).toBe(1500000);
  });
  it('does not add time for ended sessions or a clock before resume', () => {
    expect(focusElapsedMs({...session,focus_status:'completed'},start+600000)).toBe(1234);
    expect(focusElapsedMs(session,start-1000)).toBe(1234);
  });
  it.each(['25','45','60','90'])('accepts preset/custom %s minute countdowns', minutes => {
    const form = new FormData();form.set('focus_mode','countdown');form.set('focus_minutes',minutes);
    expect(focusOptions(form)).toMatchObject({focus_mode:'countdown',target_seconds:Number(minutes)*60});
  });
  it.each(['0','-1','1.5','1441','NaN'])('rejects invalid duration %s', minutes => {
    const form = new FormData();form.set('focus_mode','countdown');form.set('focus_minutes',minutes);
    expect(()=>focusOptions(form)).toThrow();
  });
});
