import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const supabase = createAdminSupabaseClient();
    const [{ data: groups, error: groupsError }, { data: members, error: membersError }, { data: listings, error: listingsError }, { data: products, error: productsError }, { data: stores, error: storesError }] = await Promise.all([
      supabase.from("product_groups").select("id").eq("enabled", true),
      supabase.from("product_group_members").select("group_id, store_product_id").eq("enabled", true),
      supabase.from("store_products").select("id, product_id, store_id, enabled").eq("enabled", true),
      supabase.from("products").select("id").eq("enabled", true),
      supabase.from("stores").select("id, enabled, webhook_secret_hint").eq("enabled", true),
    ]);
    if (groupsError || membersError || listingsError || productsError || storesError) {
      throw new Error(groupsError?.message ?? membersError?.message ?? listingsError?.message ?? productsError?.message ?? storesError?.message ?? "Health query failed");
    }
    const storeById = new Map((stores ?? []).map((store) => [store.id, store]));
    const enabledProductIds = new Set((products ?? []).map((product) => product.id));
    const routableListingIds = new Set((listings ?? [])
      .filter((listing) => enabledProductIds.has(listing.product_id) && storeById.get(listing.store_id)?.webhook_secret_hint)
      .map((listing) => listing.id));
    const routableGroupIds = new Set((members ?? [])
      .filter((member) => routableListingIds.has(member.store_product_id))
      .map((member) => member.group_id));
    const enabledGroupIds = new Set((groups ?? []).map((group) => group.id));
    const activeRoutes = [...routableGroupIds].filter((id) => enabledGroupIds.has(id));
    if (!activeRoutes.length) throw new Error("No enabled product group has a routable listing");
    return NextResponse.json({ ok: true, enabledProductGroups: enabledGroupIds.size, routableProductGroups: activeRoutes.length, enabledStores: (stores ?? []).length, latencyMs: Date.now() - started });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Health check failed", latencyMs: Date.now() - started }, { status: 503 });
  }
}
