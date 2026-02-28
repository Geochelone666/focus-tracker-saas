import { createBrowserClient } from "@supabase/ssr";
import { getRequiredEnvVar } from "@/lib/env";

const supabaseUrl = getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL");
const supabaseAnonKey = getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
