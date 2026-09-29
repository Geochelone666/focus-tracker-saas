"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/supabase/server";

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function addSkill(formData: FormData) {
  const nameValue = formData.get("name");
  const name = typeof nameValue === "string" ? nameValue.trim() : "";

  if (name.length < 1 || name.length > 60) {
    return;
  }

  const { supabase, user } = await getAuthenticatedUser();

  await supabase.from("skills").insert({
    user_id: user.id,
    name
  });

  revalidatePath("/skills");
}

export async function toggleSkill(id: string, isDone: boolean) {
  const { supabase, user } = await getAuthenticatedUser();

  await supabase
    .from("skills")
    .update({
      is_done: isDone,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/skills");
}

export async function deleteSkill(id: string) {
  const { supabase, user } = await getAuthenticatedUser();

  await supabase.from("skills").delete().eq("id", id).eq("user_id", user.id);

  revalidatePath("/skills");
}
