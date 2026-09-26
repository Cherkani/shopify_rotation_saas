"use client";

import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ChartNoAxesCombined } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dateBucket, money, reportPeriod, type PeriodUnit } from "@/lib/reporting";

export type PerformanceDay = { label: string; date: string; clicks: number; orders?: number; revenue: number };
export type ChartUnit = PeriodUnit;
export function PerformanceChart({ days, initialCount = 14, title = "Traffic, orders & revenue", eyebrow = "Performance", description = "Volume on the left axis · revenue on the right axis.", fullRange = false, currency = "USD" }: { days: PerformanceDay[]; initialCount?: number; title?: string; eyebrow?: string; description?: string; fullRange?: boolean; currency?: string }) {
  const [unit, setUnit] = useState<ChartUnit>("days");
  const [count, setCount] = useState(initialCount);
  const latest = days.at(-1)?.date;
  const period = reportPeriod({ unit, count: String(count) }, latest ? new Date(latest + "T00:00:00Z") : new Date());
  const selected = fullRange ? days : days.filter((d) => d.date >= period.start);
  const grouping = fullRange ? (days.length > 120 ? "months" : days.length > 45 ? "weeks" : "days") : unit;
  const rows = new Map<string, PerformanceDay>();
  for (const day of selected) {
    const key = dateBucket(day.date, grouping);
    const label = grouping === "quarters" ? "Q" + (Math.floor((Number(key.slice(5, 7)) - 1) / 3) + 1) + " " + key.slice(0, 4) : new Intl.DateTimeFormat("en", { month: "short", ...(grouping === "months" ? { year: "2-digit" } : { day: "numeric" }), timeZone: "UTC" }).format(new Date(key + "T00:00:00Z"));
    const row = rows.get(key) ?? { date: key, label, clicks: 0, orders: 0, revenue: 0 };
    row.clicks += day.clicks; row.orders = (row.orders ?? 0) + (day.orders ?? 0); row.revenue += day.revenue; rows.set(key, row);
  }
  const data = [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
  const hasData = data.some((d) => d.clicks || d.orders || d.revenue);
  const config = { clicks: { label: "Redirects", color: "var(--chart-2)" }, orders: { label: "Orders", color: "var(--chart-3)" }, revenue: { label: "Order value", color: "var(--chart-1)" } };
  return <Card className="min-w-0"><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="report-eyebrow mb-2">{eyebrow}</p><CardTitle>{title}</CardTitle><CardDescription className="mt-2">{description}</CardDescription></div>{!fullRange && <div className="flex gap-2"><Select value={unit} onValueChange={(value) => { setUnit(value as ChartUnit); setCount(value === "days" ? initialCount : 1); }}><SelectTrigger aria-label="Chart time unit"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{["days", "weeks", "months", "quarters"].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectGroup></SelectContent></Select><Select value={String(count)} onValueChange={(v) => setCount(Number(v))}><SelectTrigger aria-label="Chart period count"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{Array.from({ length: { days: 90, weeks: 12, months: 12, quarters: 4 }[unit] }, (_, i) => i + 1).map((n) => <SelectItem key={n} value={String(n)}>{n} {unit}</SelectItem>)}</SelectGroup></SelectContent></Select></div>}</div></CardHeader><CardContent>
    <p className="mb-4 text-xs text-muted-foreground">{selected[0]?.date ?? "—"} — {latest ?? "—"} · {grouping === "days" ? "Daily" : grouping === "weeks" ? "Weekly" : grouping === "months" ? "Monthly" : "Quarterly"} totals</p>
    {hasData ? <ChartContainer config={config} className="h-80 w-full" aria-label={title}><ComposedChart accessibilityLayer data={data} margin={{ top: 8, right: 0, left: -12, bottom: 0 }}>
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={28} tickMargin={10} />
      <YAxis yAxisId="volume" tickLine={false} axisLine={false} allowDecimals={false} width={48} />
      <YAxis yAxisId="revenue" orientation="right" tickLine={false} axisLine={false} width={76} tickFormatter={(value) => money(Number(value), currency)} />
      <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => <div className="flex min-w-36 justify-between gap-5"><span className="text-muted-foreground">{name}</span><span className="font-medium tabular-nums">{name === "Order value" ? money(Number(value), currency) : Number(value).toLocaleString()}</span></div>} />} />
      <ChartLegend content={<ChartLegendContent />} />
      <Bar yAxisId="volume" dataKey="clicks" name="Redirects" fill="var(--color-clicks)" fillOpacity={0.65} radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false} />
      <Bar yAxisId="volume" dataKey="orders" name="Orders" fill="var(--color-orders)" radius={[3, 3, 0, 0]} maxBarSize={16} isAnimationActive={false} />
      <Line yAxisId="revenue" dataKey="revenue" name="Order value" type="linear" stroke="var(--color-revenue)" strokeWidth={2.5} dot={data.length < 3} activeDot={{ r: 4 }} isAnimationActive={false} />
    </ComposedChart></ChartContainer> : <Empty className="min-h-80"><EmptyHeader><EmptyMedia variant="icon"><ChartNoAxesCombined /></EmptyMedia><EmptyTitle>No activity in this period</EmptyTitle><EmptyDescription>Select another period or wait for the next redirect or verified Shopify order.</EmptyDescription></EmptyHeader></Empty>}
  </CardContent></Card>;
}
