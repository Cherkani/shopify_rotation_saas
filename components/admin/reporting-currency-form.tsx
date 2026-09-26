"use client";

import { useActionState, useMemo, useState } from "react";
import { DatabaseZap, RefreshCw, Save, Search, SlidersHorizontal } from "lucide-react";
import { refreshMarketRatesAction, saveCurrencyRateAction, updateReportingCurrencyAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { reportingCurrencies, type ReportingCurrency } from "@/lib/currency";
import { money } from "@/lib/reporting";

type State = { ok: boolean; error?: string; message?: string };
type Breakdown = { currency: string; orders: number; originalTotal: number; convertedOrders: number };
type Rate = { base_currency: string; quote_currency: string; effective_date: string; rate: number; source: "market" | "manual"; provider_date: string | null; updated_at: string };

export function ReportingCurrencyForm({ currency, breakdown, rates, today }: { currency: ReportingCurrency; breakdown: Breakdown[]; rates: Rate[]; today: string }) {
  const initialState: State = { ok: false };
  const [state, action, pending] = useActionState(async (_previous: State, formData: FormData) => {
    try {
      const result = await updateReportingCurrencyAction(formData);
      return { ok: true, message: result.message } as State;
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Could not update reporting currency" } as State;
    }
  }, initialState);

  const [rateSearch, setRateSearch] = useState("");
  const visibleRates = useMemo(() => rates.filter((rate) => `${rate.base_currency} ${rate.quote_currency} ${rate.source}`.toLowerCase().includes(rateSearch.trim().toLowerCase())), [rateSearch, rates]);
  return <div className="grid gap-5">
  <form action={action} className="grid gap-4">
    <div className="grid gap-2">
      <Label htmlFor="reporting-currency">Reporting currency</Label>
      <Select name="reportingCurrency" defaultValue={currency}>
        <SelectTrigger id="reporting-currency" aria-label="Reporting currency" className="w-full sm:w-72"><SelectValue /></SelectTrigger>
        <SelectContent>{reportingCurrencies.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
      </Select>
      <p className="text-sm leading-6 text-muted-foreground">Shopify&apos;s original amount and currency are always kept. Revenue cards and charts use the converted reporting amount.</p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending}><Save /> {pending ? "Saving…" : "Save reporting currency"}</Button>
      {state.ok ? <p role="status" className="text-sm text-emerald-300">{state.message}</p> : null}
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
    </div>
  </form>
  <section className="grid gap-4 xl:grid-cols-2">
    <Card className="border-border/70 bg-muted/15">
      <CardHeader>
        <div className="flex items-center gap-2"><DatabaseZap className="size-4 text-primary" aria-hidden /><CardTitle className="text-base">Currency ledger</CardTitle></div>
        <CardDescription>Original Shopify values stay unchanged. Each row is converted separately using a saved rate, then only matching reporting values are added.</CardDescription>
      </CardHeader>
      <CardContent>
        {breakdown.length ? <Table><TableHeader><TableRow><TableHead>Buyer currency</TableHead><TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Original value</TableHead><TableHead className="text-right">Converted</TableHead></TableRow></TableHeader><TableBody>{breakdown.map((row) => <TableRow key={row.currency}><TableCell className="font-medium">{row.currency}</TableCell><TableCell className="text-right tabular-nums">{row.orders}</TableCell><TableCell className="text-right tabular-nums">{money(row.originalTotal, row.currency)}</TableCell><TableCell className="text-right tabular-nums">{row.convertedOrders}/{row.orders}</TableCell></TableRow>)}</TableBody></Table> : <p className="text-sm text-muted-foreground">No Shopify sales have been received yet.</p>}
      </CardContent>
    </Card>
    <ManualRateForm currency={currency} today={today} />
  </section>
  <Card>
    <CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-primary" aria-hidden /><CardTitle className="text-base">Global exchange rates</CardTitle></div><CardDescription className="mt-2">Load every provider-supported currency for {currency}. A manual rate takes priority from its effective date onward.</CardDescription></div><MarketRateRefresh /></div>
    </CardHeader>
    <CardContent>
      {rates.length ? <div className="grid gap-3"><div className="relative max-w-sm"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input value={rateSearch} onChange={(event) => setRateSearch(event.target.value)} className="pl-9" aria-label="Find a currency rate" placeholder="Find a currency, for example EUR" /></div><p className="text-xs text-muted-foreground">Showing {visibleRates.length} of {rates.length} saved rates.</p><Table><TableHeader><TableRow><TableHead>Pair</TableHead><TableHead>Effective date</TableHead><TableHead className="text-right">Rate</TableHead><TableHead>Source</TableHead></TableRow></TableHeader><TableBody>{visibleRates.map((rate) => <TableRow key={`${rate.base_currency}-${rate.quote_currency}-${rate.effective_date}`}><TableCell className="font-medium">{rate.base_currency} → {rate.quote_currency}</TableCell><TableCell>{rate.effective_date}</TableCell><TableCell className="text-right tabular-nums">1 {rate.base_currency} = {Number(rate.rate).toLocaleString(undefined, { maximumFractionDigits: 6 })} {rate.quote_currency}</TableCell><TableCell><span className={rate.source === "manual" ? "rounded-full bg-primary/15 px-2 py-1 text-xs font-medium text-primary" : "rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"}>{rate.source === "manual" ? "Manual" : "Market cache"}</span></TableCell></TableRow>)}</TableBody></Table>{!visibleRates.length ? <p className="text-sm text-muted-foreground">No saved rate matches that search.</p> : null}</div> : <p className="text-sm text-muted-foreground">Load global rates to browse every provider-supported currency, or wait for the next Shopify sale.</p>}
    </CardContent>
  </Card>
  </div>;
}

function MarketRateRefresh() {
  const initialState: State = { ok: false };
  const [state, action, pending] = useActionState(async (_previous: State, formData: FormData) => {
    void _previous;
    void formData;
    try { return { ok: true, message: (await refreshMarketRatesAction()).message } as State; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not refresh market rates" } as State; }
  }, initialState);
  return <form action={action} className="flex flex-wrap items-center gap-2"><Button type="submit" variant="outline" disabled={pending}><RefreshCw className={pending ? "animate-spin" : ""} /> {pending ? "Loading…" : "Load global rates"}</Button>{state.ok ? <p role="status" className="text-xs text-emerald-300">{state.message}</p> : null}{state.error ? <p role="alert" className="text-xs text-destructive">{state.error}</p> : null}</form>;
}

function ManualRateForm({ currency, today }: { currency: string; today: string }) {
  const initialState: State = { ok: false };
  const [state, action, pending] = useActionState(async (_previous: State, formData: FormData) => {
    try { return { ok: true, message: (await saveCurrencyRateAction(formData)).message } as State; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not save the rate" } as State; }
  }, initialState);
  return <Card className="border-border/70 bg-muted/15"><CardHeader><CardTitle className="text-base">Override a rate</CardTitle><CardDescription>Use this when you want an approximate or business-specific rate. Saving refreshes your reporting totals.</CardDescription></CardHeader><CardContent><form action={action} className="grid gap-3 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="base-currency">From</Label><Select name="baseCurrency" defaultValue="MAD"><SelectTrigger id="base-currency"><SelectValue /></SelectTrigger><SelectContent>{reportingCurrencies.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="quote-currency">To</Label><Select name="quoteCurrency" defaultValue={currency}><SelectTrigger id="quote-currency"><SelectValue /></SelectTrigger><SelectContent>{reportingCurrencies.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="rate-date">Effective date</Label><Input id="rate-date" name="effectiveDate" type="date" defaultValue={today} required /></div><div className="grid gap-2"><Label htmlFor="manual-rate">Rate</Label><Input id="manual-rate" name="rate" inputMode="decimal" placeholder="0.10" required /></div><div className="sm:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" variant="outline" disabled={pending}><Save /> {pending ? "Saving…" : "Save manual rate"}</Button>{state.ok ? <p role="status" className="text-sm text-emerald-300">{state.message}</p> : null}{state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}</div></form></CardContent></Card>;
}
