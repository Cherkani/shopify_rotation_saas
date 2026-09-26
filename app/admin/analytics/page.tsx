import { AnalyticsIntelligence } from "@/components/admin/analytics-intelligence";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { fetchReportData } from "@/lib/report-data";
import { reportPeriod, type SearchParams } from "@/lib/reporting";

export const dynamic = "force-dynamic";
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const period = reportPeriod(await searchParams);
  const db = createAdminSupabaseClient();
  const [report, groups, members, listings, stores, settings] = await Promise.all([
    fetchReportData(period),
    db.from("product_groups").select("id, name, slug, enabled").order("name"),
    db.from("product_group_members").select("group_id, store_product_id"),
    db.from("store_products").select("id, store_id"),
    db.from("stores").select("id, name, enabled").order("name"),
    db.from("rotator_settings").select("reporting_currency").eq("id", true).maybeSingle(),
  ]);
  if (groups.error || members.error || listings.error || stores.error) throw new Error("Reporting filters could not be loaded. Try again.");
  const storeByListing = new Map((listings.data ?? []).map((listing) => [listing.id, listing.store_id]));
  const groupStoreMembers = (members.data ?? []).map((member) => ({ group_id: member.group_id, store_id: storeByListing.get(member.store_product_id) ?? "" })).filter((member) => member.store_id);
  return <main className="report-workspace flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
    <div><p className="report-eyebrow">Performance / Reports</p><h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight">Understand what sells.</h1><p className="mt-2 text-pretty text-sm text-muted-foreground">Deep product, store, group, route, and campaign performance based on saved product-group attribution.</p></div>
    <AnalyticsIntelligence {...report} period={period} groups={groups.data ?? []} members={groupStoreMembers} stores={stores.data ?? []} currency={settings.data?.reporting_currency ?? "USD"} />
  </main>;
}
