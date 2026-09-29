export type CsvSession = {
  started_at: string;
  ended_at: string | null;
  note: string | null;
};

function escapeField(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
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
      Math.max(0, Math.floor(((end?.getTime() ?? now) - start.getTime()) / 1000)),
      end === null ? "active" : "ended",
      session.note ?? ""
    ]);
  }

  return rows.map((row) => row.map(escapeField).join(",")).join("\r\n") + "\r\n";
}
