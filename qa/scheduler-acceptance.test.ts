import { describe, expect, it } from "vitest";
import {
  compareDeterministicOutputs, inspectFrozenStability, inspectSchedulerProposal,
  type QAInput, type QAProposal,
} from "./scheduler-acceptance";

const hour = 3_600_000;
const origin = Date.parse("2026-11-02T12:00:00Z");
const input = (): QAInput => ({
  tasks: [
    { id: "a", durationMinutes: 60, deadlineMs: origin + 2 * hour },
    { id: "b", durationMinutes: 30, earliestStartMs: origin + hour },
  ],
  windows: [{ startMs: origin, endMs: origin + 3 * hour }],
  locked: [],
});
const proposal = (): QAProposal => ({
  assignments: [
    { taskId: "a", startMs: origin, endMs: origin + hour, reasonCodes: ["EARLY_SLOT"] },
    { taskId: "b", startMs: origin + hour, endMs: origin + hour * 1.5, reasonCodes: ["AFTER_FIRST"] },
  ],
  unassigned: [],
});
describe("F2-Q02: independent scheduler result oracle (NOT engine acceptance)", () => {
  it("accepts valid adjacent intervals and deadlines exactly at their boundaries", () => {
    const p = proposal(), ctx = input();
    ctx.tasks[0].deadlineMs = origin + hour;
    expect(inspectSchedulerProposal(ctx, p)).toEqual([]);
  });
  it("detects overlaps, deadlines, availability breaches, premature starts and locked-block collisions", () => {
    const p = proposal(), ctx = input();
    p.assignments[1].startMs = origin + 30 * 60000;
    p.assignments[1].endMs = origin + hour;
    ctx.tasks[1].earliestStartMs = origin + 2 * hour;
    ctx.locked.push({ startMs: origin + 45 * 60000, endMs: origin + hour + 15 * 60000 });
    ctx.tasks[0].deadlineMs = origin + 45 * 60000;
    const reasons = inspectSchedulerProposal(ctx, p);
    expect(reasons).toEqual(expect.arrayContaining([
      "ASSIGNMENT_OVERLAP", "DEADLINE_VIOLATION", "EARLY_START", "LOCKED_BLOCK_CONFLICT"
    ]));
    p.assignments[1].startMs = origin + 3 * hour;
    p.assignments[1].endMs = origin + 3.5 * hour;
    expect(inspectSchedulerProposal(ctx, p)).toContain("OUTSIDE_AVAILABILITY");
  });
  it("detects moved frozen blocks and preserves the stable accepted snapshot", () => {
    const ctx = input(), p = proposal();
    ctx.locked = [{ taskId: "a", startMs: origin, endMs: origin + hour }];
    expect(inspectSchedulerProposal(ctx, p)).toEqual([]);
    const shifted = structuredClone(p);
    shifted.assignments[0].startMs += hour;
    shifted.assignments[0].endMs += hour;
    expect(inspectSchedulerProposal(ctx, shifted)).toContain("LOCKED_TASK_MOVED");
    expect(inspectFrozenStability(p, shifted, ["a"])).toEqual(["FROZEN_MOVED:a"]);
    expect(inspectFrozenStability(p, shifted, ["b"])).toEqual([]);
  });
  it("requires one explained result per task, even when no feasible schedule exists", () => {
    const ctx = input();
    const none: QAProposal = {
      assignments: [], unassigned: [
        { taskId: "a", reasonCode: "NO_AVAILABLE_SLOT" },
        { taskId: "b", reasonCode: "NO_AVAILABLE_SLOT" },
      ],
    };
    expect(inspectSchedulerProposal(ctx, none)).toEqual([]);
    none.unassigned.pop();
    expect(inspectSchedulerProposal(ctx, none)).toContain("OMITTED_TASK");
    none.unassigned.push({ taskId: "a", reasonCode: "" });
    expect(inspectSchedulerProposal(ctx, none)).toEqual(
      expect.arrayContaining(["DUPLICATE_TASK_RESULT", "MISSING_UNASSIGNED_REASON", "OMITTED_TASK"])
    );
  });
  it("rejects malformed numbers, duplicate outputs and invalid explanation codes", () => {
    const p = proposal();
    p.assignments[0].endMs = Infinity;
    p.assignments[0].reasonCodes = [];
    p.assignments.push({ ...p.assignments[1], reasonCodes: ["UNKNOWN"] });
    const issues = inspectSchedulerProposal(input(), p);
    expect(issues).toEqual(expect.arrayContaining([
      "INVALID_INTERVAL", "MISSING_REASON_CODES", "DUPLICATE_ASSIGNMENT"
    ]));
  });
  it("detects nondeterministic output ordering rather than silently sorting it away", () => {
    const a = proposal(), b = structuredClone(a);
    expect(compareDeterministicOutputs(a, b)).toBe(true);
    b.assignments.reverse();
    expect(compareDeterministicOutputs(a, b)).toBe(false);
  });
  it("examines large near-boundary timestamps without floating-point rounding", () => {
    const large = Number.MAX_SAFE_INTEGER - hour;
    const ctx: QAInput = {
      tasks: [{ id: "edge", durationMinutes: 1, deadlineMs: large + 60000 }],
      windows: [{ startMs: large, endMs: large + 60000 }],
      locked: [],
    };
    const p: QAProposal = {
      assignments: [{ taskId: "edge", startMs: large, endMs: large + 60000, reasonCodes: ["BOUNDARY"] }],
      unassigned: [],
    };
    expect(inspectSchedulerProposal(ctx, p)).toEqual([]);
    p.assignments[0].endMs += 1;
    expect(inspectSchedulerProposal(ctx, p)).toEqual(
      expect.arrayContaining(["WRONG_DURATION", "DEADLINE_VIOLATION", "OUTSIDE_AVAILABILITY"])
    );
  });
});
