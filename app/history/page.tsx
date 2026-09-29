import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDuration } from "@/lib/analytics";
import { createClient } from "@/supabase/server";

const PAGE_SIZE = 20;
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  dateStyle: "medium",
  timeStyle: "short"
});

export default async function HistoryPage({
  searchParams
}: {
  searchParams: { page?: string | string[] };
}) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const requestedPage = typeof searchParams.page === "string" ? Number(searchParams.page) : 1;
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const { count, error: countError } = await supabase
    .from("focus_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  if (!countError && page > totalPages) {
    redirect(`/history?page=${totalPages}`);
  }

  const { data: sessions, error: sessionsError } = countError
    ? { data: null, error: countError }
    : await supabase
        .from("focus_sessions")
        .select("id, started_at, ended_at, note")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const error = countError || sessionsError;
  const now = Date.now();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16">
      <h1 className="mb-2 text-3xl font-bold tracking-tight text-slate-900">Session History</h1>
      <p className="mb-6 text-slate-600">Your focus sessions. Times are shown in America/Toronto.</p>

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-4">
        {error ? (
          <p role="alert" className="text-slate-600">
            We couldn&apos;t load your session history. Please try again later.
          </p>
        ) : !sessions?.length ? (
          <p className="text-slate-600">
            No focus sessions yet. Start your first session from the Dashboard.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th scope="col" className="px-2 py-2 font-medium">Started</th>
                  <th scope="col" className="px-2 py-2 font-medium">Ended</th>
                  <th scope="col" className="px-2 py-2 font-medium">Duration</th>
                  <th scope="col" className="px-2 py-2 font-medium">Status</th>
                  <th scope="col" className="px-2 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const seconds = Math.max(0, Math.floor(
                    ((session.ended_at ? new Date(session.ended_at).getTime() : now) -
                      new Date(session.started_at).getTime()) / 1000
                  ));

                  return (
                    <tr key={session.id} className="border-b border-slate-100">
                      <td className="px-2 py-2 text-slate-800">
                        {dateFormatter.format(new Date(session.started_at))}
                      </td>
                      <td className="px-2 py-2 text-slate-800">
                        {session.ended_at ? dateFormatter.format(new Date(session.ended_at)) : "-"}
                      </td>
                      <td className="px-2 py-2 text-slate-800">{formatDuration(seconds)}</td>
                      <td className="px-2 py-2 text-slate-800">{session.ended_at === null ? "Active" : "Ended"}</td>
                      <td className="px-2 py-2 text-slate-800">{session.note ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!error && (
        <nav aria-label="Session history pagination" className="flex items-center justify-center gap-4 text-sm">
          {page > 1 && (
            <Link href={`/history?page=${page - 1}`} className="font-medium text-slate-900 underline underline-offset-4">
              Previous
            </Link>
          )}
          <span className="text-slate-600">Page {page} of {totalPages}</span>
          {page < totalPages && (
            <Link href={`/history?page=${page + 1}`} className="font-medium text-slate-900 underline underline-offset-4">
              Next
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
