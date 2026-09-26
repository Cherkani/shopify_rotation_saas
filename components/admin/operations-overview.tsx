"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartNoAxesCombined,
  ExternalLink,
  Filter,
  Radio,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyRouterLink } from "@/components/admin/copy-router-link";

type Option = { id: string; name: string; routeUrl?: string };
type Click = {
  date: string;
  storeId: string | null;
  productId: string | null;
  groupId: string | null;
};
type Order = {
  date: string;
  storeId: string | null;
  productId: string | null;
  groupId: string | null;
  revenue: number;
  attributed: boolean;
};
type GroupListing = {
  groupId: string;
  storeId: string;
  productId: string;
  productName: string;
  storeName: string;
  listingName: string;
  productUrl: string;
  step: number;
  active: boolean;
  remainingSteps: number;
};
const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
const LEGEND_COLOR_CLASSES = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];
const REFRESH_STORAGE_KEY = "targetflow:overview-refresh-ms";
const REFRESH_OPTIONS = [
  { id: "off", name: "Off", interval: null },
  { id: "60000", name: "Every 1 minute", interval: 60_000 },
  { id: "300000", name: "Every 5 minutes", interval: 300_000 },
  { id: "900000", name: "Every 15 minutes", interval: 900_000 },
];

export function OperationsOverview({
  clicks,
  orders,
  groups,
  groupListings,
  currency,
}: {
  clicks: Click[];
  orders: Order[];
  groups: Option[];
  groupListings: GroupListing[];
  currency: string;
}) {
  const router = useRouter();
  const [range, setRange] = useState("30");
  const [groupId, setGroupId] = useState("all");
  const [refreshMs, setRefreshMs] = useState<number | null>(60_000);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem(REFRESH_STORAGE_KEY);
      const option = REFRESH_OPTIONS.find((item) => item.id === saved);
      if (option) setRefreshMs(option.interval);
      setLastUpdated(new Date());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!refreshMs) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setLastUpdated(new Date());
      router.refresh();
    }, refreshMs);
    return () => window.clearInterval(timer);
  }, [refreshMs, router]);

  function setRefreshInterval(value: string) {
    const option =
      REFRESH_OPTIONS.find((item) => item.id === value) ?? REFRESH_OPTIONS[1];
    setRefreshMs(option.interval);
    window.localStorage.setItem(REFRESH_STORAGE_KEY, option.id);
  }

  function refreshNow() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setLastUpdated(new Date());
    router.refresh();
    window.setTimeout(() => setIsRefreshing(false), 650);
  }
  const data = useMemo(() => {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - Number(range) + 1);
    const start = cutoff.toISOString().slice(0, 10);
    const matches = (row: Click | Order) =>
      row.date >= start && (groupId === "all" || row.groupId === groupId);
    const selectedClicks = clicks.filter(matches);
    const selectedOrders = orders.filter(matches);
    const days = new Map<
      string,
      { label: string; redirects: number; orders: number; revenue: number }
    >();
    for (let offset = 0; offset < Number(range); offset++) {
      const date = new Date(cutoff);
      date.setUTCDate(cutoff.getUTCDate() + offset);
      const key = date.toISOString().slice(0, 10);
      days.set(key, {
        label: new Intl.DateTimeFormat("en", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(date),
        redirects: 0,
        orders: 0,
        revenue: 0,
      });
    }
    for (const row of selectedClicks) {
      const day = days.get(row.date);
      if (day) day.redirects++;
    }
    for (const row of selectedOrders) {
      const day = days.get(row.date);
      if (day) {
        day.orders++;
        day.revenue += row.revenue;
      }
    }
    const score = new Map(
      groups.map((option) => [
        option.id,
        { name: option.name, redirects: 0, orders: 0, revenue: 0 },
      ]),
    );
    for (const row of selectedClicks) {
      const target = row.groupId;
      if (target && score.has(target)) score.get(target)!.redirects++;
    }
    for (const row of selectedOrders) {
      const target = row.groupId;
      if (target && score.has(target)) {
        score.get(target)!.orders++;
        score.get(target)!.revenue += row.revenue;
      }
    }
    const breakdownRows = [...score.values()]
      .filter((row) => row.redirects || row.orders)
      .sort((a, b) => b.orders - a.orders || b.redirects - a.redirects)
      .slice(0, 7);
    return {
      days: [...days.values()],
      clicks: selectedClicks,
      orders: selectedOrders,
      breakdownRows,
    };
  }, [clicks, groupId, groups, orders, range]);
  const totalRevenue = data.orders.reduce(
    (sum, order) => sum + order.revenue,
    0,
  );
  const attributed = data.orders.filter((order) => order.attributed).length;
  const attribution = [
    { name: "Attributed", value: attributed },
    { name: "Other", value: data.orders.length - attributed },
  ].filter((item) => item.value);
  const selectedGroup = groups.find((group) => group.id === groupId);

  const refreshOption =
    REFRESH_OPTIONS.find((option) => option.interval === refreshMs) ??
    REFRESH_OPTIONS[1];
  const refreshStatus = isRefreshing
    ? "Refreshing dashboard data…"
    : refreshMs
      ? `Live refresh ${refreshOption.name.toLowerCase()}`
      : "Live refresh is off";
  return (
    <section className="space-y-5">
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-end">
            <div className="flex items-center gap-2 pb-1">
              <Filter className="size-4 text-[#f2c96d]" />
              <div>
                <p className="text-sm font-medium">Dashboard filters</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Scope every metric below.
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FilterSelect
                label="Period"
                value={range}
                onChange={setRange}
                options={[
                  { id: "7", name: "Last 7 days" },
                  { id: "30", name: "Last 30 days" },
                  { id: "90", name: "Last 90 days" },
                ]}
              />
              <FilterSelect
                label="Product group"
                value={groupId}
                onChange={setGroupId}
                options={groups}
                all="All groups"
              />
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="grid gap-1">
              <label
                htmlFor="overview-refresh"
                className="text-xs text-muted-foreground"
              >
                Live refresh
              </label>
              <select
                id="overview-refresh"
                value={refreshOption.id}
                onChange={(event) => setRefreshInterval(event.target.value)}
                className="ops-select min-w-48"
              >
                <option value="off">Off</option>
                <option value="60000">Every 1 minute</option>
                <option value="300000">Every 5 minutes</option>
                <option value="900000">Every 15 minutes</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <Radio
                  className={refreshMs ? "size-3 text-emerald-300" : "size-3"}
                  aria-hidden="true"
                />
                {refreshStatus}
                {lastUpdated
                  ? ` · Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={refreshNow}
                aria-label="Refresh operations overview now"
              >
                <RefreshCw
                  className={isRefreshing ? "animate-spin motion-reduce:animate-none" : undefined}
                  aria-hidden="true"
                />
                {isRefreshing ? "Refreshing…" : "Refresh now"}
              </Button>
            </div>
          </div>
          {selectedGroup?.routeUrl ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Selected product group route
                </p>
                <p className="mt-1 text-sm font-medium">{selectedGroup.name}</p>
              </div>
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-black/10 p-2">
                <code
                  className="min-w-0 flex-1 truncate text-xs text-[#f2c96d]"
                  title={selectedGroup.routeUrl}
                >
                  {selectedGroup.routeUrl}
                </code>
                <CopyRouterLink
                  url={selectedGroup.routeUrl}
                  label="Copy group link"
                />
                <Button
                  asChild
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Open ${selectedGroup.name} route`}
                >
                  <a
                    href={selectedGroup.routeUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink />
                  </a>
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Redirects"
          value={data.clicks.length.toLocaleString()}
          note="Product route visits"
        />
        <Metric
          label="Verified sales"
          value={data.orders.length.toLocaleString()}
          note={`${attributed.toLocaleString()} attributed`}
        />
        <Metric
          label="Revenue"
          value={money(totalRevenue, currency)}
          note="Recorded Shopify value"
        />
        <Metric
          label="Conversion"
          value={
            data.clicks.length
              ? `${((data.orders.length / data.clicks.length) * 100).toFixed(1)}%`
              : "—"
          }
          note="Sales per route visit"
        />
      </section>
      <TrendChart rows={data.days} currency={currency} />
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,.85fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Product group performance</CardTitle>
            <CardDescription>
              Compare route traffic, verified sales, and revenue across product
              groups.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BreakdownChart rows={data.breakdownRows} currency={currency} />
          </CardContent>
        </Card>
        <LegendDonut
          title="Sales attribution"
          description="Orders connected to a direct product route."
          rows={attribution}
          total={data.orders.length}
          centerLabel="attributed"
          emphasis={attributed}
        />
      </section>
      <GroupProducts
        group={selectedGroup}
        listings={groupListings.filter(
          (listing) => listing.groupId === groupId,
        )}
        clicks={data.clicks}
        orders={data.orders}
        currency={currency}
      />
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  all,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  all?: string;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="ops-select w-full"
      >
        <option value="all">{all ?? "All"}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}
function TrendChart({
  rows,
  currency,
}: {
  rows: { label: string; redirects: number; orders: number; revenue: number }[];
  currency: string;
}) {
  const config = {
    redirects: { label: "Redirects", color: "var(--chart-1)" },
    orders: { label: "Verified sales", color: "var(--chart-2)" },
  };
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Traffic and sales trend</CardTitle>
        <CardDescription>
          Route visits are shown as columns; the sales area makes the conversion
          pattern easy to follow.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.some((row) => row.redirects || row.orders) ? (
          <ChartContainer
            config={config}
            className="h-80 w-full"
            aria-label="Traffic and sales over time"
          >
            <ComposedChart
              accessibilityLayer
              data={rows}
              margin={{ top: 8, right: 4, left: -16, bottom: 0 }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                minTickGap={28}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name, item) => (
                      <div className="grid min-w-40 gap-1">
                        <div className="flex justify-between gap-4">
                          <span>{name}</span>
                          <span className="font-medium tabular-nums">
                            {Number(value).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4 text-muted-foreground">
                          <span>Revenue</span>
                          <span className="tabular-nums">
                            {money(Number(item.payload.revenue), currency)}
                          </span>
                        </div>
                      </div>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="redirects"
                name="Redirects"
                fill="var(--color-redirects)"
                fillOpacity={0.45}
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              />
              <Area
                dataKey="orders"
                name="Verified sales"
                type="natural"
                fill="var(--color-orders)"
                fillOpacity={0.22}
                stroke="var(--color-orders)"
                strokeWidth={2.5}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ChartContainer>
        ) : (
          <NoData />
        )}
      </CardContent>
    </Card>
  );
}
function BreakdownChart({
  rows,
  currency,
}: {
  rows: { name: string; redirects: number; orders: number; revenue: number }[];
  currency: string;
}) {
  const config = {
    redirects: { label: "Redirects", color: "var(--chart-1)" },
    orders: { label: "Sales", color: "var(--chart-2)" },
  };
  return rows.length ? (
    <ChartContainer
      config={config}
      className="h-80 w-full"
      aria-label="Performance breakdown"
    >
      <BarChart
        accessibilityLayer
        data={rows}
        layout="vertical"
        margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
      >
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <YAxis
          dataKey="name"
          type="category"
          width={120}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: string) =>
            value.length > 18 ? `${value.slice(0, 17)}…` : value
          }
        />
        <XAxis
          type="number"
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => (
                <div className="grid min-w-40 gap-1">
                  <div className="flex justify-between gap-4">
                    <span>{name}</span>
                    <span className="font-medium tabular-nums">
                      {Number(value).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 text-muted-foreground">
                    <span>Revenue</span>
                    <span className="tabular-nums">
                      {money(Number(item.payload.revenue), currency)}
                    </span>
                  </div>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="redirects"
          name="Redirects"
          fill="var(--color-redirects)"
          fillOpacity={0.45}
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
          isAnimationActive={false}
        />
        <Bar
          dataKey="orders"
          name="Sales"
          fill="var(--color-orders)"
          radius={[0, 4, 4, 0]}
          maxBarSize={20}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  ) : (
    <NoData />
  );
}
function LegendDonut({
  title,
  description,
  rows,
  total,
  centerLabel,
  emphasis,
}: {
  title: string;
  description: string;
  rows: { name: string; value: number }[];
  total: number;
  centerLabel: string;
  emphasis?: number;
}) {
  const data = rows.map((row, index) => ({
    ...row,
    segment: `segment-${index}`,
  }));
  const config = Object.fromEntries(
    data.map((row, index) => [
      row.segment,
      { label: row.name, color: COLORS[index] },
    ]),
  );
  const centerValue =
    emphasis === undefined
      ? total.toLocaleString()
      : total
        ? `${Math.round((emphasis / total) * 100)}%`
        : "—";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length ? (
          <div className="flex flex-col gap-3">
            <div className="relative mx-auto h-56 w-full max-w-xs">
              <ChartContainer config={config} className="h-56 w-full">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={3}
                  >
                    {data.map((row, index) => (
                      <Cell key={row.segment} fill={COLORS[index]} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    content={<ChartTooltipContent nameKey="segment" />}
                  />
                  <ChartLegend
                    content={
                      <ChartLegendContent
                        nameKey="segment"
                        className="flex-wrap gap-x-3 gap-y-1 text-xs"
                      />
                    }
                  />
                </PieChart>
              </ChartContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">
                    {centerValue}
                  </p>
                  <p className="text-xs text-muted-foreground">{centerLabel}</p>
                </div>
              </div>
            </div>
            <ul className="grid gap-2">
              {data.map((row, index) => (
                <li
                  key={row.segment}
                  className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`size-2 shrink-0 rounded-full ${LEGEND_COLOR_CLASSES[index % LEGEND_COLOR_CLASSES.length]}`}
                    />
                    <span className="truncate">{row.name}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {row.value.toLocaleString()} ·{" "}
                    {total ? Math.round((row.value / total) * 100) : 0}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <NoData compact />
        )}
      </CardContent>
    </Card>
  );
}
function GroupProducts({
  group,
  listings,
  clicks,
  orders,
  currency,
}: {
  group?: Option;
  listings: GroupListing[];
  clicks: Click[];
  orders: Order[];
  currency: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {group ? `${group.name} allocation` : "Products in a group"}
        </CardTitle>
        <CardDescription>
          {group
            ? "Live route traffic, verified sales, revenue, and rotation progress for each selected product listing."
            : "Choose a product group above to inspect its product listings and store destinations."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {group ? (
          listings.length ? (
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {listings.map((listing, index) => {
                const redirects = clicks.filter(
                  (click) =>
                    click.storeId === listing.storeId &&
                    click.productId === listing.productId,
                ).length;
                const listingOrders = orders.filter(
                  (order) =>
                    order.storeId === listing.storeId &&
                    order.productId === listing.productId,
                );
                const revenue = listingOrders.reduce(
                  (sum, order) => sum + order.revenue,
                  0,
                );
                const currentStepSales = listing.active
                  ? Math.max(0, listing.step - listing.remainingSteps)
                  : null;
                return (
                  <div
                    key={`${listing.groupId}-${listing.storeId}-${listing.productId}`}
                    className={`rounded-xl border p-4 ${listing.active ? "border-emerald-300/50 bg-emerald-300/[.06]" : "border-white/10 bg-black/10"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Badge variant={listing.active ? "secondary" : "outline"}>
                        {listing.active ? "Receiving traffic" : "Ready"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Sales step {listing.step}
                      </span>
                    </div>
                    <p className="mt-4 truncate font-semibold">
                      {listing.productName}
                    </p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {listing.storeName} · {listing.listingName}
                    </p>
                    <div className="mt-3 flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-black/10 p-2">
                      <code
                        className="min-w-0 flex-1 truncate text-xs text-[#f2c96d]"
                        title={listing.productUrl}
                      >
                        {listing.productUrl}
                      </code>
                      <CopyRouterLink
                        url={listing.productUrl}
                        label="Copy product link"
                      />
                      <Button
                        asChild
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Open ${listing.productName} link`}
                      >
                        <a
                          href={listing.productUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink />
                        </a>
                      </Button>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-xs sm:grid-cols-4">
                      <AllocationMetric
                        label="Redirects"
                        value={redirects.toLocaleString()}
                      />
                      <AllocationMetric
                        label="Total sales"
                        value={listingOrders.length.toLocaleString()}
                      />
                      <AllocationMetric
                        label="Current step"
                        value={currentStepSales === null ? "—" : `${currentStepSales}/${listing.step}`}
                      />
                      <AllocationMetric
                        label="Revenue"
                        value={money(revenue, currency)}
                      />
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {listing.active
                        ? `${currentStepSales} of ${listing.step} sales in this step · ${listing.remainingSteps} remaining until rotation`
                        : `Sequence position ${index + 1}`}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <NoData compact />
          )
        ) : (
          <NoData compact />
        )}
      </CardContent>
    </Card>
  );
}
function AllocationMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-semibold tabular-nums">{value}</p>
    </div>
  );
}
function NoData({ compact = false }: { compact?: boolean }) {
  return (
    <Empty className={compact ? "min-h-0 border-0 p-0" : "min-h-80"}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ChartNoAxesCombined />
        </EmptyMedia>
        <EmptyTitle>No activity for these filters</EmptyTitle>
        <EmptyDescription>
          Adjust the filters or wait for the next route visit and verified sale.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
