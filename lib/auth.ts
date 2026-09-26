import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function requireAdmin(): Promise<{ email: string }> {
  const session = await getAdminSession();
  if (!session) redirect("/login?next=/admin");

  const admin = createAdminSupabaseClient();
  const { data: profile } = await admin
    .from("admin_profiles")
    .select("email, role, enabled")
    .eq("email", session.email)
    .eq("role", "admin")
    .eq("enabled", true)
    .maybeSingle();

  if (!profile) {
    redirect("/login?next=/admin");
  }
  return { email: profile.email };
}
