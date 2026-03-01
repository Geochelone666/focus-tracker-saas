import { createBrowserClient } from "@supabase/ssr";
import { getRequiredEnvVar } from "@/lib/env";

export function createClient() {
  const supabaseUrl = getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
