import { readAllRows } from "@/lib/paginated-query";
import {
  buildAnalyticsDays,
  formatDuration,
  getTorontoMidnight,
  getTodayRangeUtc,
  getDailyProgressPercent,
  groupSecondsByDay,
  sumDurations,
  type SessionDurationRow
} from "@/lib/analytics";
import { redirect } from "next/navigation";
import { createClient } from "@/supabase/server";
import { cleanupDuplicateActiveSessions, discardStaleSession, resumeStaleSession, startSession, stopSession, updateDailyTarget } from "@/app/dashboard/actions";
import { classifyActiveSession, pickLatestActiveSession } from "@/lib/active-session";
import { SessionTimer } from "@/components/session-timer";

type SessionRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  note: string | null;
  skill_id: string | null;
};

export default async function DashboardPage({
  searchParams
}: {
  searchParams: { error?: string | string[] };
}) {
  const error = typeof searchParams.error === "string" ? searchParams.error : undefined;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: activeSessions, error: activeSessionError } = await supabase
    .from("focus_sessions")
    .select("id, started_at, skill_id")
    .eq("user_id", user.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .order("id", { ascending: false });

  // Avoid a redirect loop if recovery failed on the preceding request.
  if ((activeSessions?.length ?? 0) > 1 && error !== "Couldn't recover the running session. Please try again.") {
    await cleanupDuplicateActiveSessions();
  }
  const latest = pickLatestActiveSession(activeSessions ?? []);
  const now = new Date();
  const activeState = classifyActiveSession(latest?.started_at, now);
  const hoursAgo = latest ? Math.floor((now.getTime() - new Date(latest.started_at).getTime()) / 3600000) : 0;
  const relative = hoursAgo >= 24
    ? `${Math.floor(hoursAgo / 24)} ${hoursAgo < 48 ? "day" : "days"}`
    : `${hoursAgo} hours`;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("daily_focus_target_minutes, timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) {
    const { error: createProfileError } = await supabase.from("profiles").upsert(
      { user_id: user.id },
      { onConflict: "user_id", ignoreDuplicates: true }
    );
    if (createProfileError) throw createProfileError;
  }
  const target = profile?.daily_focus_target_minutes ?? null;
  const timezone = profile?.timezone ?? "America/Toronto";
  const { startUtc, endUtc } = getTodayRangeUtc(new Date(), timezone);
  const todaySessions = await readAllRows((from, to) => supabase
    .from("focus_sessions")
    .select("duration_sec")
    .eq("user_id", user.id)
    .gte("started_at", startUtc.toISOString())
    .lt("started_at", endUtc.toISOString())
    .order("id")
    .range(from, to));
  const todayMinutes = sumDurations(todaySessions ?? []) / 60;
  const progressPercent = getDailyProgressPercent(todayMinutes, target);

  const { data: sessions } = await supabase
    .from("focus_sessions")
    .select("id, started_at, ended_at, duration_sec, note, skill_id")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(20);

  const typedSessions: SessionRow[] = (sessions ?? []) as SessionRow[];

  const { data: skills } = await supabase
    .from("skills")
    .select("id, name")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  const analyticsDays = buildAnalyticsDays(new Date());
  const today = analyticsDays[analyticsDays.length - 1].date;
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(today.getUTCDate() + 1);
  const analyticsStart = getTorontoMidnight(analyticsDays[0].date).toISOString();
  const analyticsEnd = getTorontoMidnight(tomorrow).toISOString();

  const weeklySessions = await readAllRows((from, to) => supabase
    .from("focus_sessions")
    .select("started_at, duration_sec")
    .eq("user_id", user.id)
    .gte("started_at", analyticsStart)
    .lt("started_at", analyticsEnd)
    .order("id")
    .range(from, to));

  const typedWeeklySessions: SessionDurationRow[] = (weeklySessions ?? []) as SessionDurationRow[];

  const weeklyTotalSeconds = sumDurations(typedWeeklySessions);
  const secondsByDay = groupSecondsByDay(typedWeeklySessions, analyticsDays.map((day) => day.key));
  const dailyFocus = analyticsDays.map((day) => ({
    ...day,
    minutes: Math.floor((secondsByDay.get(day.key) ?? 0) / 60)
  }));
  const maximumDailyMinutes = Math.max(...dailyFocus.map((day) => day.minutes));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
      <p className="mb-6 break-words text-slate-600">You are logged in as {user.email}.</p>

      {error && (
        <div role="alert" className="mb-6 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      )}

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Focus Summary (Last 7 Days)</h2>
        <p className="mt-2 text-slate-700">Total focused time: {formatDuration(weeklyTotalSeconds)}</p>
        {activeSessionError ? (
          <p role="alert" className="mt-4 text-red-800">Couldn&apos;t load the running session. Please refresh to try again.</p>
        ) : activeState === "stale" ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-slate-900">
            <p>Previous session detected. Started {relative} ago</p>
            <div className="mt-3 flex gap-3">
              <form action={resumeStaleSession}>
                <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">Resume</button>
              </form>
              <form action={discardStaleSession}>
                <button type="submit" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100">Discard</button>
              </form>
            </div>
          </div>
        ) : (
          <>
            {activeState === "active" && latest && <SessionTimer key={latest.started_at} startedAt={latest.started_at} />}
            <div className="mt-4 flex flex-wrap gap-3">
              {activeState === "none" && <form action={startSession} className="flex min-w-0 flex-wrap items-center gap-3">
                <label htmlFor="start-skill" className="text-sm text-slate-700">Skill (optional)</label>
                <select
                  id="start-skill"
                  name="skill_id"
                  defaultValue=""
                  className="min-w-0 max-w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">No skill</option>
                  {(skills ?? []).map((skill) => (
                    <option key={skill.id} value={skill.id}>{skill.name}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                >
                  Start Session
                </button>
              </form>}
              {activeState === "active" && <form action={stopSession} className="flex min-w-0 flex-wrap items-center gap-3">
                <input type="hidden" name="session_id" value={latest?.id ?? ""} />
                <label htmlFor="stop-skill" className="text-sm text-slate-700">Skill (optional)</label>
                <select
                  id="stop-skill"
                  name="skill_id"
                  defaultValue={latest?.skill_id ?? ""}
                  className="min-w-0 max-w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">{latest?.skill_id ? "Keep current skill" : "No skill"}</option>
                  {(skills ?? []).map((skill) => (
                    <option key={skill.id} value={skill.id}>{skill.name}</option>
                  ))}
                </select>
                <label htmlFor="session-note" className="sr-only">Session note (optional)</label>
                <input
                  id="session-note"
                  name="note"
                  type="text"
                  maxLength={200}
                  placeholder="What did you work on? (optional)"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-80"
                />
                <button
                  type="submit"
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                >
                  Stop Session
                </button>
              </form>}
            </div>
          </>
        )}
      </section>

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Today&apos;s Focus Goal</h2>
        {target !== null ? (
          <>
            <p className="mt-2 text-slate-700">{Math.floor(todayMinutes)} / {target} min today</p>
            <div
              className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label="Daily focus goal"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent ?? 0}
            >
              <div className="h-full rounded-full bg-slate-900" style={{ width: `${progressPercent}%` }} />
            </div>
          </>
        ) : (
          <p className="mt-2 text-slate-600">Set your daily focus goal</p>
        )}
        <form action={updateDailyTarget} className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="target-minutes" className="sr-only">Daily target in minutes</label>
          <input
            id="target-minutes"
            name="target_minutes"
            type="number"
            defaultValue={target ?? ""}
            min={1}
            max={1440}
            step={1}
            placeholder="minutes"
            aria-describedby="target-help"
            className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            {target !== null ? "Save" : "Set target"}
          </button>
        </form>
        <p id="target-help" className="mt-2 text-sm text-slate-600">Leave blank to clear your goal.</p>
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
