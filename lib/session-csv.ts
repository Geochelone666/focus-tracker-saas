import { focusElapsedMs, type FocusSession } from './focus-state';
export type CsvSession = Partial<FocusSession> & {
  duration_sec?: number | null;
  started_at: string;
  ended_at: string | null;
  note: string | null;
};

// Spreadsheet apps evaluate cells starting with these characters as formulas
// (OWASP "CSV injection"); prefix free text with an apostrophe so it stays text.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeField(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function textCell(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

export function buildSessionCsv(sessions: CsvSession[], now = Date.now()): string {
  const rows: (string | number)[][] = [
    ["started_at", "ended_at", "duration_seconds", "status", "note"]
  ];

  for (const session of sessions) {
    const start = new Date(session.started_at);
    const end = session.ended_at === null ? null : new Date(session.ended_at);
    rows.push([
      start.toISOString(),
      end?.toISOString() ?? "",
      session.duration_sec !== undefined
        ? end ? session.duration_sec ?? 0 : session.session_kind && session.session_kind !== 'focus' ? 0 : Math.floor(focusElapsedMs(session as FocusSession, now)/1000)
        : Math.max(0, Math.floor(((end?.getTime() ?? now) - start.getTime()) / 1000)),
      session.focus_status ?? (end === null ? "active" : "ended"),
      textCell(session.note ?? "")
    ]);
  }

  return rows.map((row) => row.map(escapeField).join(",")).join("\r\n") + "\r\n";
}
