import Link from "next/link";
import { ArrowRight, CircleDotDashed, Package } from "lucide-react";
import { OperationsOverview } from "@/components/admin/operations-overview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
type Group = { id: string; name: string; slug: string; enabled: boolean; step_mode: "equal_step" | "custom_step"; equal_step: number };

export default async function DashboardPage() {
  const db = createAdminSupabaseClient();
  const today = new Date(); const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 89));
  const [{ data: groups }, { data: members }, { data: listings }, { data: products }, { data: stores }, { data: states }, { data: clicks }, { data: orders }, { data: settings }] = await Promise.all([
    db.from("product_groups").select("id, name, slug, enabled, step_mode, equal_step").order("created_at", { ascending: false }),
    db.from("product_group_members").select("group_id, store_product_id, step_count, sequence_position"),
    db.from("store_products").select("id, product_id, store_id, product_url, enabled"),
    db.from("products").select("id, name, enabled"),
    db.from("stores").select("id, name, enabled").order("rotation_position"),
    db.from("product_group_state").select("group_id, active_member_store_product_id, remaining_steps, rotation_round"),
    db.from("route_clicks").select("store_id, product_id, product_group_id, created_at").gte("created_at", start.toISOString()),
    db.from("orders_log").select("store_id, store_product_id, product_group_id, total_price, currency, reporting_total, reporting_currency, created_at, attribution_status").gte("created_at", start.toISOString()),
    db.from("rotator_settings").select("reporting_currency").eq("id", true).maybeSingle(),
  ]);
  const groupRows = (groups ?? []) as Group[];
  const productMap = new Map((products ?? []).map((product) => [product.id, product]));
  const storeMap = new Map((stores ?? []).map((store) => [store.id, store]));
  const listingMap = new Map((listings ?? []).map((listing) => [listing.id, listing]));
  const stateMap = new Map((states ?? []).map((state) => [state.group_id, state]));
  const dashboardClicks = (clicks ?? []).map((click) => ({ date: String(click.created_at).slice(0, 10), storeId: click.store_id, productId: click.product_id, groupId: click.product_group_id }));
  const currency = settings?.reporting_currency ?? "USD";
  const dashboardOrders = (orders ?? []).map((order) => ({ date: String(order.created_at).slice(0, 10), storeId: order.store_id, productId: order.store_product_id ? listingMap.get(order.store_product_id)?.product_id ?? null : null, groupId: order.product_group_id, revenue: order.reporting_currency === currency ? Number(order.reporting_total ?? 0) : order.currency === currency ? Number(order.total_price ?? 0) : 0, attributed: order.attribution_status === "attributed" }));
  const groupListings = groupRows.flatMap((group) => (members ?? []).filter((member) => member.group_id === group.id).sort((a, b) => a.sequence_position - b.sequence_position).flatMap((member) => { const listing = listingMap.get(member.store_product_id); if (!listing) return []; const state = stateMap.get(group.id); const baseStep = group.step_mode === "equal_step" ? group.equal_step : member.step_count; const round = state?.rotation_round ?? 1; return [{ groupId: group.id, storeId: listing.store_id, productId: listing.product_id, productName: productMap.get(listing.product_id)?.name ?? "Unknown product", storeName: storeMap.get(listing.store_id)?.name ?? "Unknown store", listingName: productMap.get(listing.product_id)?.name ?? "Unknown product", productUrl: listing.product_url, step: baseStep * round, active: state?.active_member_store_product_id === listing.id, remainingSteps: state?.remaining_steps ?? 0 }]; }));
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  return <main className="space-y-6 p-4 sm:p-6"><section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><Badge variant="secondary"><CircleDotDashed /> Product routing operations</Badge><h1 className="mt-3 text-balance text-2xl font-semibold sm:text-3xl">Operations overview.</h1><p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">A complete view of your product groups, product links, route traffic, and verified Shopify sales.</p></div><div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/admin/products"><Package /> Products</Link></Button><Button asChild><Link href="/admin/routing">Product groups <ArrowRight /></Link></Button></div></section><OperationsOverview clicks={dashboardClicks} orders={dashboardOrders} groups={groupRows.map((group) => ({ id: group.id, name: group.name, routeUrl: `${origin}/r/${group.slug}` }))} groupListings={groupListings} currency={currency} /></main>;
}
