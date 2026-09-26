import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

export function createAdminSupabaseClient() {
  const env = getEnv();
  const serverKey = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serverKey) throw new Error("Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serverKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
