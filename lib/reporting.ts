export type PeriodUnit = "days" | "weeks" | "months" | "quarters";
export type ReportPeriod = { start: string; end: string; previousStart: string; previousEnd: string; unit: PeriodUnit; count: number };
export type SearchParams = Record<string, string | string[] | undefined>;
const dayMs = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
export function reportPeriod(params: SearchParams, now = new Date()): ReportPeriod {
  const unit: PeriodUnit = ["days", "weeks", "months", "quarters"].includes(String(params.unit)) ? params.unit as PeriodUnit : "days";
  const max = { days: 366, weeks: 52, months: 12, quarters: 4 }[unit];
  const count = Math.min(max, Math.max(1, Math.floor(Number(params.count) || (unit === "days" ? 30 : 1))));
  const end = new Date(`${iso(now)}T00:00:00Z`);
  const start = new Date(end);
  if (unit === "days" || unit === "weeks") start.setUTCDate(start.getUTCDate() - count * (unit === "weeks" ? 7 : 1) + 1);
  else {
    // Calendar months / quarters to date, never approximate them as 31/91 days.
    start.setUTCDate(1);
    const month = unit === "quarters" ? Math.floor(start.getUTCMonth() / 3) * 3 : start.getUTCMonth();
    start.setUTCMonth(month - (count - 1) * (unit === "quarters" ? 3 : 1));
  }
  const span = end.getTime() - start.getTime() + dayMs;
  return { start: iso(start), end: iso(end), previousStart: iso(new Date(start.getTime() - span)), previousEnd: iso(new Date(start.getTime() - dayMs)), unit, count };
}
export function nextDate(date: string) { return iso(new Date(new Date(`${date}T00:00:00Z`).getTime() + dayMs)); }
export function dateBucket(date: string, unit: PeriodUnit) {
  const value = new Date(`${date}T00:00:00Z`);
  if (unit === "weeks") value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7);
  if (unit === "months" || unit === "quarters") { value.setUTCDate(1); if (unit === "quarters") value.setUTCMonth(Math.floor(value.getUTCMonth() / 3) * 3); }
  return iso(value);
}
export function money(value: number, currency: string) {
  return /^[A-Z]{3}$/.test(currency) ? new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) : `${value.toLocaleString()} (currency unknown)`;
}

export type ProductItem = { id: string; productId: string | null; title: string; sku: string; quantity: number; gross: number; discount: number };
export type ReportOrder = { id: string; store_id: string; store_product_id?: string | null; product_group_id?: string | null; attribution_status?: string | null; shopify_order_id: string; created_at: string; currency: string | null; total_price: number | null; reporting_currency?: string | null; reporting_total?: number | null; exchange_rate?: number | null; product_items: ProductItem[] | null };
export function rankProducts(orders: ReportOrder[], members: { store_id: string; group_id: string }[]) {
  const groupByStore = new Map(members.map((member) => [member.store_id, member.group_id]));
  const rows = new Map<string, { key: string; groupId: string | null; currency: string; title: string; units: number; orderIds: Set<string>; storeIds: Set<string>; skus: Set<string>; gross: number; discount: number }>();
  for (const order of orders) for (const item of order.product_items ?? []) {
    const groupId = order.product_group_id ?? groupByStore.get(order.store_id) ?? null;
    const currency = order.currency || "Unknown";
    // Groups share a catalog; Shopify IDs and SKUs can differ between shops.
    // Consolidate matching product names inside a group, rolling up variants.
    // Unnamed items and unassigned stores must remain isolated.
    const title = item.title.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    const identity = title && title !== "untitled product" ? title : [order.store_id, item.productId || item.id];
    const key = JSON.stringify([groupId ?? `store:${order.store_id}`, currency, identity]);
    const row = rows.get(key) ?? { key, groupId, currency, title: item.title, units: 0, orderIds: new Set<string>(), storeIds: new Set<string>(), skus: new Set<string>(), gross: 0, discount: 0 };
    row.units += item.quantity; row.gross += item.gross; row.discount += item.discount;
    row.orderIds.add(JSON.stringify([order.store_id, order.id])); row.storeIds.add(order.store_id);
    if (item.sku) row.skus.add(item.sku);
    rows.set(key, row);
  }
  return [...rows.values()].map(({ orderIds, storeIds, skus, ...row }) => ({ ...row, skus: [...skus], stores: storeIds.size, orders: orderIds.size, revenue: Math.max(0, row.gross - row.discount) })).sort((a, b) => b.units - a.units || a.title.localeCompare(b.title));
}
