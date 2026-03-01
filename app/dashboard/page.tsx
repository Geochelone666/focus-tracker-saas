import { redirect } from "next/navigation";
import { createClient } from "@/supabase/server";
import { startSession, stopSession } from "@/app/dashboard/actions";

type SessionRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  note: string | null;
};

type SessionDurationRow = {
  duration_sec: number | null;
};

function formatDuration(totalSeconds: number | null) {
  if (!totalSeconds || totalSeconds <= 0) {
    return "0m";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: sessions } = await supabase
    .from("focus_sessions")
    .select("id, started_at, ended_at, duration_sec, note")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(20);

  const typedSessions: SessionRow[] = (sessions ?? []) as SessionRow[];

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: weeklySessions } = await supabase
    .from("focus_sessions")
    .select("duration_sec")
    .eq("user_id", user.id)
    .gte("started_at", sevenDaysAgo);

  const typedWeeklySessions: SessionDurationRow[] = (weeklySessions ?? []) as SessionDurationRow[];

  const weeklyTotalSeconds = typedWeeklySessions.reduce((sum: number, row: SessionDurationRow) => {
    return sum + (row.duration_sec ?? 0);
  }, 0);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
      <p className="mb-6 text-slate-600">You are logged in as {user.email}.</p>

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Focus Summary (Last 7 Days)</h2>
        <p className="mt-2 text-slate-700">Total focused time: {formatDuration(weeklyTotalSeconds)}</p>
        <div className="mt-4 flex gap-3">
          <form action={startSession}>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Start Session
            </button>
          </form>
          <form action={stopSession}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
            >
              Stop Session
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Recent Sessions</h2>

        {typedSessions.length === 0 ? (
          <p className="text-slate-600">No sessions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="px-2 py-2 font-medium">Started</th>
                  <th className="px-2 py-2 font-medium">Ended</th>
                  <th className="px-2 py-2 font-medium">Duration</th>
                  <th className="px-2 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {typedSessions.map((session: SessionRow) => (
                  <tr key={session.id} className="border-b border-slate-100">
                    <td className="px-2 py-2 text-slate-800">{new Date(session.started_at).toLocaleString()}</td>
                    <td className="px-2 py-2 text-slate-800">
                      {session.ended_at ? new Date(session.ended_at).toLocaleString() : "Active"}
                    </td>
                    <td className="px-2 py-2 text-slate-800">{formatDuration(session.duration_sec)}</td>
                    <td className="px-2 py-2 text-slate-800">{session.note ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
