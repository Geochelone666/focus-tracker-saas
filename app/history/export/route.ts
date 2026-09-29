import { redirect } from "next/navigation";
import { buildSessionCsv, type CsvSession } from "@/lib/session-csv";
import { createClient } from "@/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const now = new Date();
  const sessions: CsvSession[] = [];
  const batchSize = 1000;
  // Continue until empty, even if the server's row limit is below batchSize.
  while (true) {
    const { data, error } = await supabase
      .from("focus_sessions")
      .select("started_at, ended_at, note")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .order("id", { ascending: false })
      .range(sessions.length, sessions.length + batchSize - 1);

    if (error) {
      return new Response("Could not export session history. Please try again later.", {
        status: 500,
        headers: { "Cache-Control": "private, no-store" }
      });
    }
    if (!data?.length) break;
    sessions.push(...data);
  }

  return new Response(buildSessionCsv(sessions, now.getTime()), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="focus-sessions-${now.toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store"
    }
  });
}
