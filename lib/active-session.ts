export const STALE_ACTIVE_SESSION_MS = 12 * 60 * 60 * 1000;

export type ActiveSessionState = "none" | "active" | "stale";

export function classifyActiveSession(
  startedAt: string | null | undefined,
  now: Date
): ActiveSessionState {
  if (!startedAt) return "none";
  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(started)) return "none";
  return now.getTime() - started > STALE_ACTIVE_SESSION_MS ? "stale" : "active";
}

export function pickLatestActiveSession<T extends { started_at: string }>(sessions: readonly T[]): T | null {
  return sessions.reduce<T | null>((latest, session) => {
    const started = new Date(session.started_at).getTime();
    if (!Number.isFinite(started)) return latest;
    return !latest || started > new Date(latest.started_at).getTime() ? session : latest;
  }, null);
}

export function formatElapsed(ms: number): string {
  const seconds = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
