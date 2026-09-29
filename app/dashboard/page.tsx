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
  started_at: string;
  duration_sec: number | null;
};

const ANALYTICS_TIME_ZONE = "America/Toronto";

const analyticsDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ANALYTICS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const timeZoneOffsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ANALYTICS_TIME_ZONE,
  timeZoneName: "longOffset"
});

function getDateKey(date: Date) {
  const parts = analyticsDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function getTorontoMidnight(date: Date) {
  const utcMidnight = date.getTime();
  const offsetPart = timeZoneOffsetFormatter
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = offsetPart?.match(/GMT([+-])(\d{2}):(\d{2})/);

  if (!match) {
    throw new Error("Could not determine the America/Toronto UTC offset.");
  }

  const direction = match[1] === "+" ? 1 : -1;
  const offsetMinutes = direction * (Number(match[2]) * 60 + Number(match[3]));

  return new Date(utcMidnight - offsetMinutes * 60 * 1000);
}

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

  const todayKey = getDateKey(new Date());
  const [year, month, day] = todayKey.split("-").map(Number);
  const today = new Date(Date.UTC(year, month - 1, day));
  const analyticsDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (6 - index));

    return {
      date,
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("en-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC"
      })
    };
  });
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(today.getUTCDate() + 1);
  const analyticsStart = getTorontoMidnight(analyticsDays[0].date).toISOString();
  const analyticsEnd = getTorontoMidnight(tomorrow).toISOString();

  const { data: weeklySessions } = await supabase
    .from("focus_sessions")
    .select("started_at, duration_sec")
    .eq("user_id", user.id)
    .gte("started_at", analyticsStart)
    .lt("started_at", analyticsEnd);

  const typedWeeklySessions: SessionDurationRow[] = (weeklySessions ?? []) as SessionDurationRow[];

  const weeklyTotalSeconds = typedWeeklySessions.reduce((sum: number, row: SessionDurationRow) => {
    return sum + (row.duration_sec ?? 0);
  }, 0);

  const secondsByDay = new Map(analyticsDays.map((day) => [day.key, 0]));
  typedWeeklySessions.forEach((session) => {
    const dateKey = getDateKey(new Date(session.started_at));
    secondsByDay.set(dateKey, (secondsByDay.get(dateKey) ?? 0) + (session.duration_sec ?? 0));
  });
  const dailyFocus = analyticsDays.map((day) => ({
    ...day,
    minutes: Math.floor((secondsByDay.get(day.key) ?? 0) / 60)
  }));
  const maximumDailyMinutes = Math.max(...dailyFocus.map((day) => day.minutes));

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

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-4">
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

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Last 7 days</h2>
        <p className="mt-1 text-sm text-slate-600">Focused minutes per day in America/Toronto.</p>
        <div className="mt-5 space-y-4">
          {dailyFocus.map((day) => {
            const barWidth = maximumDailyMinutes === 0 ? 0 : (day.minutes / maximumDailyMinutes) * 100;

            return (
              <div key={day.key}>
                <div className="mb-1 flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-slate-700">{day.label}</span>
                  <span className="tabular-nums text-slate-600">
                    {day.minutes} {day.minutes === 1 ? "minute" : "minutes"}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-900"
                    style={{ width: `${barWidth}%` }}
                    role="img"
                    aria-label={`${day.label}: ${day.minutes} focused minutes`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
