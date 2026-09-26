"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { Download, PackageSearch, Search } from "lucide-react";
import { PerformanceChart, type PerformanceDay } from "@/components/admin/performance-chart";
import { ReportPeriodFilter } from "@/components/admin/report-period-filter";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dateBucket, money, nextDate, rankProducts, type ReportOrder, type ReportPeriod } from "@/lib/reporting";
import type { TrafficRow } from "@/lib/report-data";

type Props = {
  period: ReportPeriod; orders: ReportOrder[]; traffic: TrafficRow[]; productCaptureAvailable: boolean;
  groups: { id: string; name: string; slug: string; enabled: boolean }[];
  members: { group_id: string; store_id: string }[];
  stores: { id: string; name: string; enabled: boolean }[];
  currency: string;
};

export function AnalyticsIntelligence({ period, orders: sourceOrders, traffic, groups, members, stores, productCaptureAvailable, currency }: Props) {
  const [groupId, setGroupId] = useState("all");
  const [storeId, setStoreId] = useState("all");
  const orders: ReportOrder[] = sourceOrders.map((order) => {
    const converted = order.reporting_currency === currency && order.reporting_total !== null && order.reporting_total !== undefined;
    const alreadyInReportingCurrency = order.currency === currency;
    const rate = converted ? Number(order.exchange_rate ?? 1) : alreadyInReportingCurrency ? 1 : 0;
    return {
      ...order,
      currency: converted || alreadyInReportingCurrency ? currency : order.currency,
      total_price: converted ? order.reporting_total ?? null : alreadyInReportingCurrency ? order.total_price ?? null : null,
      product_items: order.product_items?.map((item) => ({ ...item, gross: Math.round((item.gross * rate + Number.EPSILON) * 100) / 100, discount: Math.round((item.discount * rate + Number.EPSILON) * 100) / 100 })) ?? null,
    };
  });
  const [sort, setSort] = useState("units");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const groupStores = stores.filter((store) => groupId === "all" || members.some((m) => m.group_id === groupId && m.store_id === store.id));
  const ids = new Set(groupStores.filter((store) => storeId === "all" || store.id === storeId).map((store) => store.id));
  const groupScopedOrders = orders.filter((order) => groupId === "all" || order.product_group_id === groupId);
  const matching = groupScopedOrders.filter((order) => storeId === "all" || ids.has(order.store_id));
  const current = matching.filter((o) => o.created_at.slice(0, 10) >= period.start && o.created_at.slice(0, 10) <= period.end);
  const previous = matching.filter((o) => o.created_at.slice(0, 10) >= period.previousStart && o.created_at.slice(0, 10) <= period.previousEnd);
  const scopedTraffic = traffic.filter((row) => (groupId === "all" || row.product_group_id === groupId) && (storeId === "all" || ids.has(row.store_id)) && row.metric_date >= period.start && row.metric_date <= period.end);
  const clicks = scopedTraffic.reduce((s, r) => s + Number(r.click_count), 0);
  const revenue = current.reduce((s, o) => s + Number(o.total_price ?? 0), 0);
  const previousRevenue = previous.reduce((s, o) => s + Number(o.total_price ?? 0), 0);
  const convertedOrderCount = current.filter((order) => order.total_price !== null).length;
  const pendingConversionCount = current.length - convertedOrderCount;
  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? "Unassigned";
  const allProducts = rankProducts(current, members);
  const products = allProducts.filter((p) => [p.title, ...p.skus, groupName(p.groupId)].join(" ").toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === "revenue" ? b.revenue - a.revenue : b.units - a.units);
  const [chosenProduct, setProduct] = useState("all");
  const selectedProduct = allProducts.find((p) => p.key === chosenProduct);
  const productName = (p: typeof allProducts[number]) => groupId === "all" ? p.title + " · " + groupName(p.groupId) : p.title;
  const actualPage = Math.min(page, Math.max(0, Math.ceil(products.length / 10) - 1));
  const covered = current.filter((o) => o.product_items !== null).length;
  const units = current.reduce((s, o) => s + (o.product_items ?? []).reduce((n, p) => n + p.quantity, 0), 0);
  const attributedOrders = current.filter((order) => order.attribution_status === "attributed").length;
  const selectedGroup = groups.find((group) => group.id === groupId);
  const days = (() => {
    const rows = new Map<string, PerformanceDay>();
    for (let date = period.start; date <= period.end; date = nextDate(date)) rows.set(date, { date, label: date, orders: 0, revenue: 0, clicks: 0 });
    for (const order of orders) {
      const row = rows.get(order.created_at.slice(0, 10));
      if (row && matching.includes(order)) { row.orders = (row.orders ?? 0) + 1; row.revenue += Number(order.total_price ?? 0); }
    }
    for (const metric of scopedTraffic) { const row = rows.get(metric.metric_date); if (row) row.clicks += Number(metric.click_count); }
    return [...rows.values()];
  })();
  const sources = new Map<string, number>();
  for (const row of scopedTraffic) sources.set(row.source || "Direct / untagged", (sources.get(row.source || "Direct / untagged") ?? 0) + Number(row.click_count));
  const sourceRows = [...sources].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const campaigns = new Map<string, { source: string; campaign: string; medium: string; redirects: number }>();
  for (const row of scopedTraffic) {
    const source = row.source || "Direct / untagged";
    const campaign = row.campaign || "Unlabelled";
    const medium = row.medium || "—";
    const key = `${source}\u0000${campaign}\u0000${medium}`;
    const currentCampaign = campaigns.get(key) ?? { source, campaign, medium, redirects: 0 };
    currentCampaign.redirects += Number(row.click_count);
    campaigns.set(key, currentCampaign);
  }
  const campaignRows = [...campaigns.values()].sort((a, b) => b.redirects - a.redirects);
  function exportProducts() {
    const safe = (value: string | number) => '"' + String(value).replace(/^[=+@\-]/, "'$&").replaceAll('"', '""') + '"';
    const csv = [["Product", "Group", "SKUs", "Units", "Orders containing product", "Product revenue", "Currency"], ...products.map((p) => [p.title, groupName(p.groupId), p.skus.join("; "), p.units, p.orders, p.revenue.toFixed(2), currency])].map((row) => row.map(safe).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "products-" + period.start + "-" + period.end + ".csv"; anchor.click(); URL.revokeObjectURL(url);
  }
  return <div className="flex min-w-0 flex-col gap-6">
    <section className="report-toolbar flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap gap-2">
        <Filter label="Group" value={groupId} onChange={(value) => { setGroupId(value); setStoreId("all"); setPage(0); }} options={[{ value: "all", label: "All groups" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]} />
        <Filter label="Store" value={storeId} onChange={(value) => { setStoreId(value); setPage(0); }} options={[{ value: "all", label: "All stores" }, ...groupStores.map((s) => ({ value: s.id, label: s.name }))]} />
        <Badge variant="outline">{currency} · UTC</Badge>
      </div>
      <ReportPeriodFilter period={period} />
    </section>
    {selectedGroup ? <a href={`/r/${selectedGroup.slug}`} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-2 text-sm font-medium text-[#f2c96d] underline underline-offset-4">Open {selectedGroup.name} product route</a> : null}
    <section className="report-kpis grid grid-cols-2 gap-px lg:grid-cols-3 xl:grid-cols-6">
      <Kpi label="Recorded order value" value={money(revenue, currency)} note={change(revenue, previousRevenue) + " vs previous period"} />
      <Kpi label="Verified orders" value={current.length.toLocaleString()} note={change(current.length, previous.length) + " vs previous period"} />
      <Kpi label="Average order value" value={money(convertedOrderCount ? revenue / convertedOrderCount : 0, currency)} note={convertedOrderCount + " converted orders in " + currency} />
      <Kpi label="Units sold" value={units.toLocaleString()} note={covered + " / " + current.length + " orders have product detail"} />
      <Kpi label="Route-attributed" value={attributedOrders.toLocaleString()} note="Orders tied to a product route" />
      <Kpi label="Route conversion" value={clicks ? `${(current.length / clicks * 100).toFixed(1)}%` : "—"} note={`${clicks.toLocaleString()} routed visits`} />
    </section>
    {pendingConversionCount ? <p role="status" className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">{pendingConversionCount} sale{pendingConversionCount === 1 ? " is" : "s are"} included in counts and units, but excluded from revenue until converted into {currency}. Save the reporting currency in System settings to backfill them.</p> : null}
    <Tabs defaultValue="overview" className="gap-5">
      <TabsList variant="line" className="w-full justify-start">
        <TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="products">Products</TabsTrigger><TabsTrigger value="demand">Sales trend</TabsTrigger><TabsTrigger value="traffic">Traffic</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="flex flex-col gap-5">
        <PerformanceChart days={days} fullRange currency={currency} title="How performance is changing" description="Orders and revenue use the selected currency. Redirects include all traffic in this scope." />
        <div className="grid gap-5 xl:grid-cols-2">
          <RankingChart title="Products driving demand" description="Units sold across stores in each group · top six products." rows={allProducts.slice(0, 6).map((p) => ({ name: productName(p), value: p.units }))} label="Units" />
          <RankingChart title="Products driving revenue" description={"Product sales after line discounts · " + currency + " · top six products."} rows={[...allProducts].sort((a, b) => b.revenue - a.revenue).slice(0, 6).map((p) => ({ name: productName(p), value: p.revenue }))} label="Product revenue" currency={currency} />
        </div>
      </TabsContent>
      <TabsContent value="products" className="flex flex-col gap-5">
        <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><CardTitle>Products within your groups</CardTitle><CardDescription>Matching product names combine across a group’s stores, including variants. Keep names consistent across stores. Product revenue excludes shipping, tax and later refunds.</CardDescription></div><Button variant="outline" onClick={exportProducts} disabled={!products.length}><Download data-icon="inline-start" />Export CSV</Button></div></CardHeader><CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Search className="size-4 text-muted-foreground" aria-hidden /><Input aria-label="Search products, SKU or group" placeholder="Search product, SKU or group…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></div><Filter label="Rank products by" value={sort} onChange={(value) => { setSort(value); setPage(0); }} options={[{ value: "units", label: "Most units sold" }, { value: "revenue", label: "Highest product revenue" }]} /></div>
          <p className="text-sm text-muted-foreground" role="status">{!productCaptureAvailable ? "Product capture is not configured yet. Complete the reporting database update to enable it." : covered < current.length ? covered + " of " + current.length + " orders contain product details. Orders without a saved product snapshot cannot appear below." : "All recorded orders in this scope have product details."}</p>
          {products.length ? <><Table><TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Group</TableHead><TableHead className="text-right">Units</TableHead><TableHead className="text-right">Orders containing product</TableHead><TableHead className="text-right">Product revenue</TableHead></TableRow></TableHeader><TableBody>{products.slice(actualPage * 10, actualPage * 10 + 10).map((p) => <TableRow key={p.key}><TableCell><p className="max-w-72 truncate font-medium" title={p.title}>{p.title}</p><p className="text-xs text-muted-foreground">{p.skus.length ? p.skus.join(", ") : "No SKU"}</p></TableCell><TableCell>{groupName(p.groupId)}</TableCell><TableCell className="text-right tabular-nums">{p.units}</TableCell><TableCell className="text-right tabular-nums">{p.orders}</TableCell><TableCell className="text-right tabular-nums">{money(p.revenue, currency)}</TableCell></TableRow>)}</TableBody></Table><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{products.length} products · Page {actualPage + 1} of {Math.ceil(products.length / 10)}</p><div className="flex gap-2"><Button variant="outline" disabled={actualPage === 0} onClick={() => setPage(actualPage - 1)}>Previous</Button><Button variant="outline" disabled={(actualPage + 1) * 10 >= products.length} onClick={() => setPage(actualPage + 1)}>Next</Button></div></div></> : <ReportEmpty title={search ? "No matching products" : "No product sales recorded"} description={search ? "Try another product name or SKU." : "Orders without saved line items cannot appear here. After deploying the current webhook receiver, new order deliveries can populate this view."} />}
        </CardContent></Card>
      </TabsContent>
      <TabsContent value="demand" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-xl font-semibold">Product sales over time</h2><p className="mt-1 text-sm text-muted-foreground">Track demand across the stores carrying the same product in a group.</p></div>
          <Filter label="Product to analyze" value={selectedProduct?.key ?? "all"} onChange={setProduct} options={[{ value: "all", label: "All products in scope" }, ...allProducts.map((p) => ({ value: p.key, label: productName(p) }))]} />
        </div>
        <ProductDemand orders={current} members={members} period={period} currency={currency} productKey={selectedProduct?.key} title={selectedProduct ? productName(selectedProduct) : "All products in scope"} />
        <p className="text-sm text-muted-foreground">Only orders with captured product details contribute. Revenue is the selected products’ line value after discounts; it excludes shipping, tax and later refunds.</p>
      </TabsContent>
      <TabsContent value="traffic" className="flex flex-col gap-5">
        <RankingChart title="Where your traffic comes from" description="UTM sources captured by the router. No purchase attribution is inferred." rows={sourceRows.slice(0, 8)} label="Redirects" />
        <Card><CardHeader><div className="flex items-center justify-between"><div><CardTitle>Campaign traffic</CardTitle><CardDescription>Captured on the group-link redirect. This is traffic attribution only, not inferred purchase attribution.</CardDescription></div><Badge variant="outline">{clicks.toLocaleString()} redirects</Badge></div></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Campaign</TableHead><TableHead>Medium</TableHead><TableHead className="text-right">Redirects</TableHead><TableHead className="text-right">Share</TableHead></TableRow></TableHeader><TableBody>{campaignRows.map((row) => <TableRow key={`${row.source}-${row.campaign}-${row.medium}`}><TableCell>{row.source}</TableCell><TableCell>{row.campaign}</TableCell><TableCell>{row.medium}</TableCell><TableCell className="text-right">{row.redirects}</TableCell><TableCell className="text-right">{clicks ? (row.redirects / clicks * 100).toFixed(1) : 0}%</TableCell></TableRow>)}</TableBody></Table>{!campaignRows.length && <ReportEmpty title="No traffic in this period" description="Redirects will appear after visitors use a group link." />}</CardContent></Card>
      </TabsContent>
    </Tabs>
    <p className="text-xs leading-5 text-muted-foreground">Order dates use webhook receipt time (UTC). Revenue uses the saved conversion into {currency}; original Shopify currencies are preserved. Group reports use current store membership.</p>
  </div>;
}

function change(current: number, previous: number) { return previous > 0 ? ((current - previous) / previous * 100 >= 0 ? "+" : "") + ((current - previous) / previous * 100).toFixed(1) + "%" : current > 0 ? "New activity" : "No change"; }
function Kpi({ label, value, note }: { label: string; value: string; note: string }) { return <div className="report-kpi"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-3 whitespace-nowrap text-[1.35rem] font-semibold tracking-tight tabular-nums sm:text-2xl lg:text-3xl">{value}</p><p className="mt-3 text-xs text-muted-foreground">{note}</p></div>; }
function Filter({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) { return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{options.map((o) => <SelectItem value={o.value} key={o.value}>{o.label}</SelectItem>)}</SelectGroup></SelectContent></Select>; }
export function ReportEmpty({ title, description }: { title: string; description: string }) { return <Empty className="min-h-56"><EmptyHeader><EmptyMedia variant="icon"><PackageSearch /></EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{description}</EmptyDescription></EmptyHeader></Empty>; }
function RankingChart({ title, description, rows, label, currency }: { title: string; description: string; rows: { name: string; value: number }[]; label: string; currency?: string }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{rows.some((r) => r.value > 0) ? <ChartContainer config={{ value: { label, color: "var(--chart-1)" } }} className="h-72 w-full" aria-label={title}><BarChart accessibilityLayer data={rows} layout="vertical" margin={{ left: 0, right: 20, top: 4, bottom: 0 }}><CartesianGrid horizontal={false} strokeDasharray="3 3" /><YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} tickFormatter={(value: string) => value.length > 16 ? value.slice(0, 15) + "…" : value} /><XAxis type="number" allowDecimals={Boolean(currency)} tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent formatter={(value) => <span>{label}: {currency ? money(Number(value), currency) : Number(value).toLocaleString()}</span>} />} /><Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive={false} /></BarChart></ChartContainer> : <ReportEmpty title="No results for this period" description="Try a longer period or a different group. New activity appears while live updates are enabled." />}</CardContent></Card>;
}

function ProductDemand({ orders, members, period, currency, productKey, title }: {
  orders: ReportOrder[]; members: Props["members"]; period: ReportPeriod; currency: string; productKey?: string; title: string;
}) {
  const unit = period.unit;
  const buckets = new Map<string, { date: string; units: number; revenue: number; orders: ReportOrder[] }>();
  for (let date = period.start; date <= period.end; date = nextDate(date)) {
    const key = dateBucket(date, unit);
    if (!buckets.has(key)) buckets.set(key, { date: key, units: 0, revenue: 0, orders: [] });
  }
  for (const order of orders) buckets.get(dateBucket(order.created_at.slice(0, 10), unit))?.orders.push(order);
  const data = [...buckets.values()].map((bucket) => {
    const products = rankProducts(bucket.orders, members).filter((p) => !productKey || p.key === productKey);
    return { date: bucket.date, units: products.reduce((sum, p) => sum + p.units, 0), revenue: products.reduce((sum, p) => sum + p.revenue, 0) };
  });
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>Units on the left axis · product revenue on the right · {unit} · {currency}</CardDescription></CardHeader><CardContent>
    {data.some((d) => d.units) ? <ChartContainer className="h-80 w-full" config={{ units: { label: "Units sold", color: "var(--chart-2)" }, revenue: { label: "Product revenue", color: "var(--chart-1)" } }} aria-label={"Product sales trend: " + title}>
      <ComposedChart accessibilityLayer data={data} margin={{ left: -12, right: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" minTickGap={30} tickLine={false} axisLine={false} />
        <YAxis yAxisId="units" allowDecimals={false} width={48} tickLine={false} axisLine={false} />
        <YAxis yAxisId="revenue" orientation="right" width={76} tickLine={false} axisLine={false} tickFormatter={(v) => money(Number(v), currency)} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => <span>{name}: {name === "Product revenue" ? money(Number(value), currency) : Number(value).toLocaleString()}</span>} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="units" name="Units sold" yAxisId="units" fill="var(--color-units)" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        <Line dataKey="revenue" name="Product revenue" yAxisId="revenue" stroke="var(--color-revenue)" strokeWidth={2.5} dot={data.length < 3} isAnimationActive={false} />
      </ComposedChart>
    </ChartContainer> : <ReportEmpty title="No product sales in this period" description="Choose another period or wait for orders with product details." />}
  </CardContent></Card>;
}
