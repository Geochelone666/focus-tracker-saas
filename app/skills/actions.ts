"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/supabase/server";
import { validateId, validateSkillName } from "@/lib/validation";

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
    redirect("/skills?error=" + encodeURIComponent(message));
  }

  if (!auth.user) {
    redirect("/login");
  }

  return { supabase: auth.supabase, user: auth.user };
}

export async function addSkill(formData: FormData) {
  const nameValue = formData.get("name");

  let name: string;
  try {
    name = validateSkillName(typeof nameValue === "string" ? nameValue : "");
  } catch {
    redirect("/skills?error=" + encodeURIComponent("Please enter a skill name between 1 and 60 characters."));
  }

  const message = "Couldn't save your skill. Please try again.";
  const { supabase, user } = await getAuthenticatedUser("addSkill", message);

  try {
    const { error } = await supabase.from("skills").insert({
      user_id: user.id,
      name
    });
    if (error) throw error;
  } catch (error) {
    console.error("[addSkill] failed to save skill", error);
    redirect("/skills?error=" + encodeURIComponent(message));
  }

  revalidatePath("/skills");
}

export async function toggleSkill(id: string, isDone: boolean) {
  try {
    id = validateId(id);
  } catch {
    redirect("/skills?error=" + encodeURIComponent("That skill couldn't be found. Please try again."));
  }

  const message = "Couldn't update your skill. Please try again.";
  const { supabase, user } = await getAuthenticatedUser("toggleSkill", message);

  try {
    const { error } = await supabase
      .from("skills")
      .update({
        is_done: isDone,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw error;
  } catch (error) {
    console.error("[toggleSkill] failed to update skill", error);
    redirect("/skills?error=" + encodeURIComponent(message));
  }

  revalidatePath("/skills");
}

export async function deleteSkill(id: string) {
  try {
    id = validateId(id);
  } catch {
    redirect("/skills?error=" + encodeURIComponent("That skill couldn't be found. Please try again."));
  }

  const message = "Couldn't delete your skill. Please try again.";
  const { supabase, user } = await getAuthenticatedUser("deleteSkill", message);

  try {
    const { error } = await supabase.from("skills").delete().eq("id", id).eq("user_id", user.id);
    if (error) throw error;
  } catch (error) {
    console.error("[deleteSkill] failed to delete skill", error);
    redirect("/skills?error=" + encodeURIComponent(message));
  }

  revalidatePath("/skills");
}
