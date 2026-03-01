"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/supabase/server";

export async function startSession() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  await supabase.from("focus_sessions").insert({
    user_id: user.id,
    started_at: new Date().toISOString(),
    ended_at: null
  });

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function stopSession() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: activeSession } = await supabase
    .from("focus_sessions")
    .select("id, started_at")
    .eq("user_id", user.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeSession?.id && activeSession.started_at) {
    const now = new Date();
    const startedAt = new Date(activeSession.started_at);
    const durationSec = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));

    await supabase
      .from("focus_sessions")
      .update({
        ended_at: now.toISOString(),
        duration_sec: durationSec
      })
      .eq("id", activeSession.id)
      .eq("user_id", user.id);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
