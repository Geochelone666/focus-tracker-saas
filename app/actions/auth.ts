"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/supabase/server";

export async function logout() {
  const supabase = await createClient();
  const cookieStore=await cookies();
  const id=cookieStore.get('focus_push_device')?.value;
  if(id&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)){
    const {data:{user}}=await supabase.auth.getUser();
    if(user){const {error}=await supabase.from('push_devices').delete().eq('id',id).eq('user_id',user.id);if(error)redirect('/settings/notifications?error=disconnect');}
    cookieStore.delete('focus_push_device');
  }
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
