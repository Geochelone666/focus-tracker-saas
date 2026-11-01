/**
 * F2-Q02 scheduler acceptance oracle. Normalize a proposed schedule into epoch
 * milliseconds before calling this. This verifier intentionally does not import
 * the scheduler implementation, database, Next.js or AI APIs.
 *
 * Passing this verifier's self-tests does NOT certify a scheduler: call it with
 * the actual engine output once F2-A02 exposes its finalized contract.
 */
export type QAInterval = { startMs: number; endMs: number };
export type QATask = {
  id: string; durationMinutes: number; deadlineMs?: number;
  earliestStartMs?: number;
};
export type QALockedBlock = QAInterval & { taskId?: string };
export type QAAssignment = QAInterval & { taskId: string; reasonCodes: string[] };
export type QAUnassigned = { taskId: string; reasonCode: string };
export type QAInput = {
  tasks: QATask[];
  windows: QAInterval[]; // Explicit instants; resolve wall times and DST before validation.
  locked: QALockedBlock[];
};
export type QAProposal = { assignments: QAAssignment[]; unassigned: QAUnassigned[] };

const validInstant = (n: number) => Number.isSafeInteger(n);
const validInterval = (x: QAInterval) =>
  validInstant(x.startMs) && validInstant(x.endMs) && x.startMs < x.endMs;
const overlaps = (a: QAInterval, b: QAInterval) =>
  a.startMs < b.endMs && b.startMs < a.endMs;
const nonemptyCode = (code: unknown) =>
  typeof code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(code);

export function inspectSchedulerProposal(input: QAInput, output: QAProposal): string[] {
  const issues: string[] = [];
  const tasks = new Map(input.tasks.map(task => [task.id, task]));
  if (tasks.size !== input.tasks.length) issues.push("DUPLICATE_INPUT_TASK");
  if (input.windows.some(window => !validInterval(window))) issues.push("INVALID_AVAILABILITY");
  if (input.locked.some(block => !validInterval(block))) issues.push("INVALID_LOCKED_INTERVAL");
  const seen = new Set<string>();
  for (const assignment of output.assignments) {
    if (seen.has(assignment.taskId)) issues.push("DUPLICATE_ASSIGNMENT");
    seen.add(assignment.taskId);
    const task = tasks.get(assignment.taskId);
    if (!task) { issues.push("UNKNOWN_TASK"); continue; }
    if (!validInterval(assignment)) { issues.push("INVALID_INTERVAL"); continue; }
    if (!Number.isSafeInteger(task.durationMinutes) || task.durationMinutes <= 0 ||
      assignment.endMs - assignment.startMs !== task.durationMinutes * 60000) {
      issues.push("WRONG_DURATION");
    }
    if (task.deadlineMs !== undefined &&
      (!validInstant(task.deadlineMs) || assignment.endMs > task.deadlineMs)) {
      issues.push("DEADLINE_VIOLATION");
    }
    if (task.earliestStartMs !== undefined &&
      (!validInstant(task.earliestStartMs) || assignment.startMs < task.earliestStartMs)) {
      issues.push("EARLY_START");
    }
    if (!input.windows.some(window =>
      validInterval(window) && window.startMs <= assignment.startMs && assignment.endMs <= window.endMs)) {
      issues.push("OUTSIDE_AVAILABILITY");
    }
    for (const block of input.locked) {
      if (!validInterval(block)) continue;
      if (block.taskId === assignment.taskId) {
        if (block.startMs !== assignment.startMs || block.endMs !== assignment.endMs) {
          issues.push("LOCKED_TASK_MOVED");
        }
      } else if (overlaps(block, assignment)) {
        issues.push("LOCKED_BLOCK_CONFLICT");
      }
    }
    if (!Array.isArray(assignment.reasonCodes) || assignment.reasonCodes.length === 0 ||
        assignment.reasonCodes.some(code => !nonemptyCode(code))) {
      issues.push("MISSING_REASON_CODES");
    }
  }
  for (let i = 0; i < output.assignments.length; i++) {
    for (let j = i + 1; j < output.assignments.length; j++) {
      if (validInterval(output.assignments[i]) && validInterval(output.assignments[j]) &&
          overlaps(output.assignments[i], output.assignments[j])) issues.push("ASSIGNMENT_OVERLAP");
    }
  }
  for (const unassigned of output.unassigned) {
    if (seen.has(unassigned.taskId)) issues.push("DUPLICATE_TASK_RESULT");
    seen.add(unassigned.taskId);
    if (!tasks.has(unassigned.taskId)) issues.push("UNKNOWN_TASK");
    if (!nonemptyCode(unassigned.reasonCode)) issues.push("MISSING_UNASSIGNED_REASON");
  }
  for (const task of input.tasks) if (!seen.has(task.id)) issues.push("OMITTED_TASK");
  return [...new Set(issues)].sort();
}

/** Check two *real engine* calls with byte-identical inputs, not a mock result. */
export function compareDeterministicOutputs(a: QAProposal, b: QAProposal): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Previously accepted/locked blocks cannot move after an incremental proposal.
 * The caller passes IDs explicitly frozen by the user; it is not a blanket
 * assertion that every other suggestion must remain unchanged.
 */
export function inspectFrozenStability(previous: QAProposal, next: QAProposal, frozenIds: string[]): string[] {
  const old = new Map(previous.assignments.map(item => [item.taskId, item]));
  const latest = new Map(next.assignments.map(item => [item.taskId, item]));
  return frozenIds.filter(id => {
    const a = old.get(id), b = latest.get(id);
    return !a || !b || a.startMs !== b.startMs || a.endMs !== b.endMs;
  }).map(id => `FROZEN_MOVED:${id}`);
}
