"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/supabase/server";
import { validateSessionNote } from "@/lib/validation";

async function getAuthenticatedUser(context: string, message: string) {
  let auth;
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error
    } = await supabase.auth.getUser();

    if (error) throw error;
    auth = { supabase, user };
  } catch (error) {
    console.error(`[${context}] failed to authenticate`, error);
    redirect("/dashboard?error=" + encodeURIComponent(message));
  }

  if (!auth.user) {
    redirect("/login");
  }

  return { supabase: auth.supabase, user: auth.user };
}

export async function startSession() {
  const message = "Couldn't start the session. Please try again.";
  const { supabase, user } = await getAuthenticatedUser("startSession", message);

  try {
    const { error } = await supabase.from("focus_sessions").insert({
      user_id: user.id,
      started_at: new Date().toISOString(),
      ended_at: null
    });
    if (error) throw error;
  } catch (error) {
    console.error("[startSession] failed to start session", error);
    redirect("/dashboard?error=" + encodeURIComponent(message));
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function stopSession(formData: FormData) {
  let note: string | null;
  try {
    const value = formData.get("note") ?? "";
    if (typeof value !== "string") throw new Error("Invalid note");
    note = validateSessionNote(value);
  } catch {
    redirect("/dashboard?error=" + encodeURIComponent("Please enter a note of 200 characters or fewer."));
  }

  const message = "Couldn't stop the session. Please try again.";
  const { supabase, user } = await getAuthenticatedUser("stopSession", message);

  try {
    const { data: activeSession, error: readError } = await supabase
      .from("focus_sessions")
      .select("id, started_at")
      .eq("user_id", user.id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (readError) throw readError;

    if (activeSession?.id && activeSession.started_at) {
      const now = new Date();
      const startedAt = new Date(activeSession.started_at);
      const durationSec = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));

      const { error } = await supabase
        .from("focus_sessions")
        .update({
          ended_at: now.toISOString(),
          duration_sec: durationSec,
          note
        })
        .eq("id", activeSession.id)
        .eq("user_id", user.id);
      if (error) throw error;
    }
  } catch (error) {
    console.error("[stopSession] failed to stop session", error);
    redirect("/dashboard?error=" + encodeURIComponent(message));
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
