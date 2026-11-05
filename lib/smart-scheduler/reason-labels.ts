import type { ReasonCode } from './types';
const labels:Record<ReasonCode,string>={
  PRESERVED_ACCEPTED:'Your previously accepted time still fits.',
  MOVED_FIXED_CONFLICT:'Moved to avoid a fixed commitment.',
  MOVED_INVALID_ACCEPTED:'The previous time no longer fits the planning constraints.',
  EARLIEST_FEASIBLE:'Placed in the earliest available time that fits.',
  PREFERRED_WINDOW:'Placed within your preferred time.',
  HIGH_PRIORITY:'Higher-priority work was considered first.',
  DEADLINE_SOON:'Scheduled with its approaching deadline in mind.',
  DEFERRED_BEFORE:'Previously postponed work was considered.',
  DEFAULT_ESTIMATE:'Uses a provisional 30-minute estimate.',
  PERSONALIZED_ESTIMATE:'Uses an estimate from the supplied completed-task history.',
  NO_AVAILABILITY:'No available work window was supplied.',
  NO_CONTIGUOUS_SLOT:'No uninterrupted slot is long enough, including a break.',
  DEADLINE_IN_PAST:'The deadline has already passed.',
  HARD_DEADLINE_UNREACHABLE:'There is not enough available time before the deadline.',
  EARLIEST_START_UNREACHABLE:'The task starts outside the chosen planning window.',
  INVALID_ESTIMATE:'Set a valid estimated duration before scheduling.',
  INVALID_INTERVAL:'The task has an invalid time interval.',
  INVALID_TASK:'The task needs valid scheduling information.',
  FIXED_BLOCKS_OVERLAP:'Some fixed commitments overlap. Their times are preserved.',
};
export const schedulingReason=(code:ReasonCode)=>labels[code];
