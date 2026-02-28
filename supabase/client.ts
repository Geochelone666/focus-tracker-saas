import { createClient } from "@supabase/supabase-js";
import { getRequiredEnvVar } from "@/lib/env";

const supabaseUrl = getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_URL");
const supabaseAnonKey = getRequiredEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
