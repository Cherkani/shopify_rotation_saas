"use client";
import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, LoaderCircle } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReportPeriod } from "@/lib/reporting";

export function ReportPeriodFilter({ period }: { period: ReportPeriod }) {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const limit = { days: 90, weeks: 52, months: 12, quarters: 4 }[period.unit];
  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString()); next.set(key, value);
    if (key === "unit") next.set("count", value === "days" ? "30" : "1");
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  }
  return <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
    {pending ? <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden /> : <CalendarDays className="size-4 text-primary" aria-hidden />}
    <Select value={period.unit} onValueChange={(value) => update("unit", value)} disabled={pending}>
      <SelectTrigger aria-label="Reporting period unit"><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>{["days", "weeks", "months", "quarters"].map((unit) => <SelectItem key={unit} value={unit}>{unit[0].toUpperCase() + unit.slice(1)}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
    <Select value={String(period.count)} onValueChange={(value) => update("count", value)} disabled={pending}>
      <SelectTrigger aria-label={`Number of ${period.unit}`}><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>{Array.from({ length: Math.max(limit, period.count) }, (_, i) => i + 1).map((n) => <SelectItem key={n} value={String(n)}>{n} {n === 1 ? period.unit.slice(0, -1) : period.unit}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
    <span className="text-xs text-muted-foreground" role="status">{pending ? "Updating report…" : `${period.start} — ${period.end} · UTC`}</span>
  </div>;
}
