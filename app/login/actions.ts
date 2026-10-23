"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/supabase/server";
import { authErrorMessage } from "@/lib/auth-errors";

function readCredential(formData: FormData, key: "email" | "password") {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return key === "email" ? value.trim() : value;
}

function getValidatedCredentials(formData: FormData) {
  const email = readCredential(formData, "email");
  const password = readCredential(formData, "password");

  if (!email || !password) {
    redirect("/login?message=Email%20and%20password%20are%20required.");
  }

  return { email, password };
}

function destination(formData:FormData){const next=formData.get('next');return typeof next==='string'&&/^\/plans\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(next)?next:'/today';}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const { email, password } = getValidatedCredentials(formData);

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(authErrorMessage(error))}${destination(formData)!=='/today'?'&next='+encodeURIComponent(destination(formData)):''}`);
  }

  revalidatePath("/", "layout");
  redirect(destination(formData));
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const { email, password } = getValidatedCredentials(formData);

  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(authErrorMessage(error))}${destination(formData)!=='/today'?'&next='+encodeURIComponent(destination(formData)):''}`);
  }

  if (!data.session) {
    redirect("/login?message=" + encodeURIComponent("Check your email to confirm your account, then log in."));
  }

  revalidatePath("/", "layout");
  redirect(destination(formData));
}
