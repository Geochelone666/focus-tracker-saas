/** F2-A02 frozen v1 contract. Engine receives only normalized UTC instants.
 * No database, AI API, random number source, clock, or network is used here.
 */
export type Priority = 'low' | 'normal' | 'high';
export type ReasonCode =
  | 'PRESERVED_ACCEPTED' | 'MOVED_FIXED_CONFLICT' | 'MOVED_INVALID_ACCEPTED'
  | 'EARLIEST_FEASIBLE' | 'PREFERRED_WINDOW' | 'HIGH_PRIORITY' | 'DEADLINE_SOON'
  | 'DEFERRED_BEFORE' | 'DEFAULT_ESTIMATE' | 'PERSONALIZED_ESTIMATE'
  | 'NO_AVAILABILITY' | 'NO_CONTIGUOUS_SLOT' | 'DEADLINE_IN_PAST'
  | 'HARD_DEADLINE_UNREACHABLE' | 'EARLIEST_START_UNREACHABLE'
  | 'INVALID_ESTIMATE' | 'INVALID_INTERVAL' | 'INVALID_TASK'
  | 'FIXED_BLOCKS_OVERLAP';
export type UtcInterval = { startUtc: string; endUtc: string };
export type SchedulerTask = {
  id: string;
  priority: Priority;
  estimatedMinutes?: number | null;
  /** Explicit hard deadline, never an all-day date with guessed timezone. */
  deadlineUtc?: string | null;
  earliestStartUtc?: string | null;
  deferralCount?: number;
  /** Missing estimates can be inferred only from provided, user-owned samples. */
  durationSamples?: DurationSample[];
  projectId?: string | null;
  skillId?: string | null;
  completed?: boolean;
  deleted?: boolean;
};
export type DurationSample = {
  minutes: number;
  projectId?: string | null;
  skillId?: string | null;
};
export type FixedBlock = UtcInterval & { id: string; kind: 'event' | 'locked' | 'active_focus' };
export type AcceptedPlacement = UtcInterval & { taskId: string };
export type SchedulerPolicy = {
  slotMinutes?: number;
  /** Mandatory post-task buffer; its reserved time must fit availability. */
  breakMinutes?: number;
  defaultEstimateMinutes?: number;
};
export type SchedulerInput = {
  nowUtc: string;
  inputRevision: string;
  tasks: SchedulerTask[];
  availability: UtcInterval[];
  fixedBlocks: FixedBlock[];
  previousPlacements?: AcceptedPlacement[];
  /** Soft preference only. Never creates availability. */
  preferredWindows?: UtcInterval[];
  policy?: SchedulerPolicy;
};
export type Placement = UtcInterval & {
  taskId: string;
  estimatedMinutes: number;
  estimateSource: 'user' | 'default' | 'history_skill' | 'history_project' | 'history_global';
  reasonCodes: ReasonCode[];
};
export type Unplaced = { taskId: string; reasonCode: ReasonCode };
export type ScheduleChange = { taskId: string; before: UtcInterval | null; after: UtcInterval | null };
export type SchedulerOutput = {
  algorithmVersion: 'smart-scheduler-v1';
  inputRevision: string;
  placements: Placement[];
  unplaced: Unplaced[];
  changes: ScheduleChange[];
  warnings: ReasonCode[];
  metrics: {
    scheduledTasks: number;
    eligibleTasks: number;
    scheduledMinutes: number;
    unplacedMinutes: number;
    coverageRatio: number;
    hardViolations: number;
    movedAcceptedTasks: number;
    totalShiftMinutes: number;
  };
};
