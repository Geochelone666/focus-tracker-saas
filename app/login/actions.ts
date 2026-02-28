"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/supabase/server";

function readCredential(formData: FormData, key: "email" | "password") {
  const value = formData.get(key);

  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

function getValidatedCredentials(formData: FormData) {
  const email = readCredential(formData, "email");
  const password = readCredential(formData, "password");

  if (!email || !password) {
    redirect("/login?message=Email%20and%20password%20are%20required.");
  }

  return { email, password };
}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const { email, password } = getValidatedCredentials(formData);

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const { email, password } = getValidatedCredentials(formData);

  const { error } = await supabase.auth.signUp({
    email,
    password
  });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
