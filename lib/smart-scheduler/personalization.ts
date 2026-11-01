import type { DurationSample, SchedulerTask } from './types';

export type EstimatedDuration = {
  minutes: number;
  source: 'user' | 'default' | 'history_skill' | 'history_project' | 'history_global';
  sampleCount: number;
  confidence: 'explicit' | 'cold_start' | 'limited' | 'supported';
};
const valid = (value: number) => Number.isFinite(value) && value >= 1 && value <= 1440;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** No synthetic training observations. Hierarchical fallback: skill, project, global.
 * 3 samples unlock a conservative median; n/(n+10) shrinks it toward the prior.
 * User's explicit estimate always wins and is not silently overwritten.
 */
export function estimateDuration(
  task: Pick<SchedulerTask, 'estimatedMinutes' | 'durationSamples' | 'projectId' | 'skillId'>,
  defaultMinutes = 30,
): EstimatedDuration {
  if (!valid(defaultMinutes)) throw new Error('Invalid default estimate');
  if (task.estimatedMinutes !== null && task.estimatedMinutes !== undefined) {
    if (!valid(task.estimatedMinutes) || !Number.isInteger(task.estimatedMinutes)) throw new Error('Invalid estimate');
    return { minutes: task.estimatedMinutes, source: 'user', sampleCount: 0, confidence: 'explicit' };
  }
  const all = (task.durationSamples ?? []).filter(sample => valid(sample.minutes));
  const choices: Array<{ source: EstimatedDuration['source']; samples: DurationSample[] }> = [];
  if (task.skillId) choices.push({ source: 'history_skill', samples: all.filter(s => s.skillId === task.skillId) });
  if (task.projectId) choices.push({ source: 'history_project', samples: all.filter(s => s.projectId === task.projectId) });
  choices.push({ source: 'history_global', samples: all });
  const selected = choices.find(choice => choice.samples.length >= 3);
  if (!selected) return { minutes: defaultMinutes, source: 'default', sampleCount: all.length, confidence: 'cold_start' };
  const n = selected.samples.length;
  const predicted = (n * median(selected.samples.map(s => s.minutes)) + 10 * defaultMinutes) / (n + 10);
  return { minutes: Math.max(1, Math.min(1440, Math.round(predicted))),
    source: selected.source, sampleCount: n, confidence: n >= 10 ? 'supported' : 'limited' };
}

export type FocusObservation = { day: string; hour: number; completed: boolean };
export type HourEvidence = { hour: number; count: number; completionRate: number };
/** Descriptive evidence only. It does not infer that the hour caused success. */
export function summarizeTimePreferences(observations: FocusObservation[]): {
  status: 'insufficient' | 'exploratory'; hours: HourEvidence[];
} {
  const rows = observations.filter(o => /^\d{4}-\d{2}-\d{2}$/.test(o.day) &&
    Number.isInteger(o.hour) && o.hour >= 0 && o.hour <= 23);
  if (rows.length < 20 || new Set(rows.map(o => o.day)).size < 5) {
    return { status: 'insufficient', hours: [] };
  }
  const grouped = new Map<number, FocusObservation[]>();
  for (const row of rows) grouped.set(row.hour, [...(grouped.get(row.hour) ?? []), row]);
  return { status: 'exploratory', hours: [...grouped.entries()]
    .filter(([, samples]) => samples.length >= 4)
    .map(([hour, samples]) => ({
      hour, count: samples.length,
      completionRate: (samples.filter(s => s.completed).length + 2) / (samples.length + 4),
    }))
    .sort((a, b) => a.hour - b.hour) };
}
