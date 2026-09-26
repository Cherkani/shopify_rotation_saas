import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { nextDate, type ReportOrder, type ReportPeriod } from "@/lib/reporting";

export type TrafficRow = { store_id: string; product_group_id: string | null; product_id: string | null; metric_date: string; click_count: number; source: string; campaign: string; medium: string };
export async function fetchReportData(period: ReportPeriod, includePrevious = true) {
  const db = createAdminSupabaseClient();
  const start = includePrevious ? period.previousStart : period.start;
  const orders: ReportOrder[] = [];
  const traffic: TrafficRow[] = [];
  let productCaptureAvailable = true;
  for (let offset = 0; ; offset += 500) {
    const result = await db.from("orders_log").select("id, store_id, store_product_id, product_group_id, attribution_status, shopify_order_id, total_price, currency, reporting_total, reporting_currency, exchange_rate, created_at, product_items")
      .gte("created_at", `${start}T00:00:00Z`).lt("created_at", `${nextDate(period.end)}T00:00:00Z`)
      .order("created_at").order("id").range(offset, offset + 499);
    let rows: ReportOrder[] = (result.data ?? []) as ReportOrder[];
    if (result.error && ["42703", "PGRST204"].includes(result.error.code)) {
      productCaptureAvailable = false;
      const legacy = await db.from("orders_log").select("id, store_id, shopify_order_id, total_price, currency, created_at")
        .gte("created_at", `${start}T00:00:00Z`).lt("created_at", `${nextDate(period.end)}T00:00:00Z`)
        .order("created_at").order("id").range(offset, offset + 499);
      if (legacy.error) throw new Error("Order reporting could not be loaded. Try again.");
      rows = (legacy.data ?? []).map((row) => ({ ...row, store_product_id: null, product_group_id: null, attribution_status: "unattributed", product_items: null }));
    } else if (result.error) throw new Error("Order reporting could not be loaded. Try again.");
    orders.push(...rows);
    if (rows.length < 500) break;
    if (offset >= 49500) throw new Error("This report exceeds 50,000 orders. Select a shorter reporting period.");
  }
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("route_clicks").select("store_id, product_group_id, product_id, created_at, source, campaign, medium")
      .gte("created_at", `${start}T00:00:00Z`).lt("created_at", `${nextDate(period.end)}T00:00:00Z`).order("created_at").order("id").range(offset, offset + 499);
    if (error) throw new Error("Traffic reporting could not be loaded. Try again.");
    traffic.push(...(data ?? []).map((row) => ({ store_id: row.store_id, product_group_id: row.product_group_id, product_id: row.product_id, metric_date: String(row.created_at).slice(0, 10), click_count: 1, source: row.source ?? "", campaign: row.campaign ?? "", medium: row.medium ?? "" })));
    if ((data?.length ?? 0) < 500) break;
    if (offset >= 49500) throw new Error("This report exceeds 50,000 traffic rows. Select a shorter reporting period.");
  }
  return { orders, traffic, productCaptureAvailable };
}
