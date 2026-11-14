import { describe, expect, it } from 'vitest';
import { estimateDuration, summarizeTimePreferences } from './personalization';

describe('cold-start estimate and conservative personalized statistics',()=>{
  it('01 honors user-entered estimates over history',()=>{
    expect(estimateDuration({estimatedMinutes:35,durationSamples:Array.from({length:20},()=>({minutes:90}))}).minutes).toBe(35);
  });
  it('02 supplies a documented default with zero observations',()=>{
    expect(estimateDuration({estimatedMinutes:null})).toEqual({minutes:30,source:'default',sampleCount:0,confidence:'cold_start'});
  });
  it('03 refuses to infer a preference from only two samples',()=>{
    expect(estimateDuration({estimatedMinutes:null,durationSamples:[{minutes:99},{minutes:100}]}).source).toBe('default');
  });
  it('04 shrinks a three-sample median to the prior instead of overfitting',()=>{
    const result=estimateDuration({estimatedMinutes:null,durationSamples:[{minutes:60},{minutes:70},{minutes:80}]});
    expect(result).toMatchObject({minutes:39,source:'history_global',sampleCount:3,confidence:'limited'});
  });
  it('05 prefers matching skill data over project/global aggregates',()=>{
    const samples=[...Array.from({length:6},()=>({minutes:80,skillId:'x'})),...Array.from({length:6},()=>({minutes:10,projectId:'p'}))];
    expect(estimateDuration({estimatedMinutes:null,skillId:'x',projectId:'p',durationSamples:samples}).source).toBe('history_skill');
  });
  it('06 falls back from sparse skill evidence to project',()=>{
    const samples=[{minutes:60,skillId:'x'},...Array.from({length:4},()=>({minutes:55,projectId:'p'}))];
    expect(estimateDuration({estimatedMinutes:null,skillId:'x',projectId:'p',durationSamples:samples}).source).toBe('history_project');
  });
  it('07 drops invalid measurements rather than treating them as zeros',()=>{
    const result=estimateDuration({estimatedMinutes:null,durationSamples:[{minutes:NaN},{minutes:-2},{minutes:Infinity}]});
    expect(result).toMatchObject({sampleCount:0,source:'default'});
  });
  it('08 rejects invalid default parameters',()=>{
    expect(()=>estimateDuration({},0)).toThrow('Invalid default estimate');
  });
  it('09 never estimates more than the supported maximum',()=>{
    const result=estimateDuration({estimatedMinutes:null,durationSamples:Array.from({length:100},()=>({minutes:1440}))});
    expect(result.minutes).toBeLessThanOrEqual(1440);
  });
  it('10 does not claim reliable hour preferences without enough days',()=>{
    const records=Array.from({length:25},()=>({day:'2026-11-01',hour:9,completed:true}));
    expect(summarizeTimePreferences(records)).toMatchObject({status:'insufficient',hours:[]});
  });
  it('11 reports smoothed descriptive evidence with sufficient observations',()=>{
    const records=Array.from({length:25},(_,i)=>({day:`2026-11-${String(1+i%5).padStart(2,'0')}`,hour:i%2?9:15,completed:i%2===0}));
    const result=summarizeTimePreferences(records);
    expect(result.status).toBe('exploratory');
    expect(result.hours.map(x=>x.hour)).toEqual([9,15]);
    expect(result.hours.every(x=>x.completionRate>0 && x.completionRate<1)).toBe(true);
  });
  it('12 is invariant to ordering of equivalent duration samples',()=>{
    const samples=[{minutes:80},{minutes:30},{minutes:50},{minutes:40}];
    expect(estimateDuration({durationSamples:samples})).toEqual(estimateDuration({durationSamples:[...samples].reverse()}));
  });
});
