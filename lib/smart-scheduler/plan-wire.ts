import type { SmartCalendarOutputV01, OwnedInterval } from './focus-adapter';
import { placementToLegacyBatchChange } from './backend-wire';

/** Candidate encoding only. Authentication and commit validation remain in the RPC. */
export function calendarDraftArguments(
  output: SmartCalendarOutputV01,
  context: { userId: string; timezone: string; revision: string; availability: OwnedInterval[] },
  selectedIds: string[],
) {
  if (output.schema_version !== 'smart-calendar/v0.1' ||
      !/^(0|[1-9]\d*)$/.test(context.revision) || BigInt(context.revision) > BigInt('9223372036854775807'))
    throw new Error('Invalid calendar version');
  if (!selectedIds.length || selectedIds.length > 50 || new Set(selectedIds).size !== selectedIds.length)
    throw new Error('Select 1–50 distinct changes');
  const minute = (value: string) => {
    const time = Date.parse(value);
    if (!Number.isFinite(time) || time % 60000 !== 0) throw new Error('Expected a whole-minute instant');
    return new Date(time).toISOString().replace('.000Z', 'Z');
  };
  const p_changes = selectedIds.map(id => {
    const changes = output.changes.filter(change => change.schedule_id === id);
    const placements = output.placements.filter(placement => placement.schedule_id === id);
    if (changes.length !== 1 || placements.length !== 1 || !changes[0].after ||
        JSON.stringify(changes[0].before) === JSON.stringify(changes[0].after))
      throw new Error('Selection must identify a changed placement');
    const placement = placements[0];
    if (Date.parse(changes[0].after.startUtc) !== Date.parse(placement.start_at) ||
        Date.parse(changes[0].after.endUtc) !== Date.parse(placement.end_at))
      throw new Error('Change and placement disagree');
    // Keep the existing later-fold representability check and duration bounds.
    placementToLegacyBatchChange(placement, context.timezone);
    return { id, expected_updated_at: placement.expected_updated_at,
      start_at: minute(placement.start_at), end_at: minute(placement.end_at) };
  });
  if (!context.availability.length || context.availability.length > 100)
    throw new Error('Expected 1–100 availability windows');
  const p_availability = context.availability.map(window => {
    if (window.user_id !== context.userId) throw new Error('Foreign availability');
    const start_at = minute(window.start_at), end_at = minute(window.end_at);
    if (end_at <= start_at) throw new Error('Invalid availability window');
    return { start_at, end_at };
  });
  // UUID base_version_id is provenance, never the bigint database CAS revision.
  return { p_changes, p_availability, p_base_revision: context.revision };
}
