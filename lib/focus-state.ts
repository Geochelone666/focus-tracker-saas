export const FOCUS_COLUMNS = 'id,started_at,skill_id,schedule_id,focus_mode,target_seconds,focus_status,accumulated_ms,resumed_at,focus_revision';
export type FocusSession = {
  id: string; started_at: string; skill_id: string | null; schedule_id: string | null;
  focus_mode: 'elapsed' | 'countdown'; target_seconds: number | null;
  focus_status: 'running' | 'paused' | 'completed' | 'abandoned';
  accumulated_ms: number; resumed_at: string | null; focus_revision: number;
};
/** Wall timestamps restore a session after reload/backgrounding; ticks only repaint. */
export function focusElapsedMs(session: FocusSession, now: number): number {
  const resumed = session.resumed_at ? Date.parse(session.resumed_at) : NaN;
  const live = session.focus_status === 'running' && Number.isFinite(resumed) ? Math.max(0, now - resumed) : 0;
  const elapsed = Math.max(0, Number(session.accumulated_ms)) + live;
  return session.focus_mode === 'countdown' ? Math.min(elapsed, (session.target_seconds ?? 0) * 1000) : elapsed;
}
export function focusOptions(form: FormData) {
  const mode = form.get('focus_mode') || 'elapsed';
  const minutes = String(form.get('focus_minutes') || '25');
  if (mode !== 'elapsed' && mode !== 'countdown') throw new Error('Choose a valid focus mode.');
  if (mode === 'countdown' && (!/^\d+$/.test(minutes) || Number(minutes) < 1 || Number(minutes) > 1440)) {
    throw new Error('Choose a focus duration of 1–1440 minutes.');
  }
  return { focus_mode: mode, target_seconds: mode === 'countdown' ? Number(minutes) * 60 : null };
}
