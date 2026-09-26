import { NextResponse } from "next/server";
import { createAdminSession, verifyAdminPassword } from "@/lib/admin-auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || password.length < 12 || email.length > 254) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  const supabase = createAdminSupabaseClient();
  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("email, password_hash, enabled, role")
    .eq("email", email)
    .eq("enabled", true)
    .eq("role", "admin")
    .maybeSingle();
  if (!profile || !await verifyAdminPassword(password, profile.password_hash)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await createAdminSession(profile.email);
  return NextResponse.json({ ok: true });
}
