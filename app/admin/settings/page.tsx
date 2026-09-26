import { Gauge, ShieldCheck, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportingCurrencyForm } from "@/components/admin/reporting-currency-form";
import { isReportingCurrency, type ReportingCurrency } from "@/lib/currency";
import { getEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const appUrl = getEnv().APP_URL.replace(/\/$/, "");
  const db = createAdminSupabaseClient();
  const [{ data: settings, error }, { data: orders, error: ordersError }, { data: rates, error: ratesError }] = await Promise.all([
    db
    .from("rotator_settings")
    .select("reporting_currency")
    .eq("id", true)
    .maybeSingle(),
    db.from("orders_log").select("currency, total_price, reporting_currency").order("created_at", { ascending: false }).limit(5_000),
    db.from("currency_rates").select("base_currency, quote_currency, effective_date, rate, source, provider_date, updated_at").order("effective_date", { ascending: false }).order("updated_at", { ascending: false }).limit(500),
  ]);
  if (error && !["42703", "PGRST204"].includes(error.code)) throw new Error("System settings could not be loaded. Try again.");
  if (ordersError) throw new Error("Currency ledger could not be loaded. Try again.");
  if (ratesError && !["42P01", "PGRST204"].includes(ratesError.code)) throw new Error("Saved exchange rates could not be loaded. Try again.");
  const candidate = settings?.reporting_currency ?? "USD";
  const currency: ReportingCurrency = isReportingCurrency(candidate) ? candidate : "USD";
  const breakdown = new Map<string, { currency: string; orders: number; originalTotal: number; convertedOrders: number }>();
  for (const order of orders ?? []) {
    const orderCurrency = order.currency ?? "Unknown";
    const row = breakdown.get(orderCurrency) ?? { currency: orderCurrency, orders: 0, originalTotal: 0, convertedOrders: 0 };
    row.orders += 1;
    row.originalTotal += Number(order.total_price ?? 0);
    if (order.reporting_currency === currency) row.convertedOrders += 1;
    breakdown.set(orderCurrency, row);
  }
  return (
    <main className="space-y-6 p-4 sm:p-6">
      <section>
        <Badge variant="secondary">
          <Settings2 />
          System
        </Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">System settings.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Control reporting currency, saved exchange rates, and the routing foundations that keep your operation reliable.
        </p>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Reporting currency</CardTitle>
          <p className="text-sm leading-6 text-muted-foreground">Choose the single currency used for platform totals, charts, group performance, and store performance.</p>
        </CardHeader>
        <CardContent>
          <ReportingCurrencyForm currency={currency} breakdown={[...breakdown.values()].sort((a, b) => b.originalTotal - a.originalTotal)} rates={(rates ?? []).filter((rate) => rate.source === "manual" || rate.source === "market").map((rate) => ({ ...rate, source: rate.source as "manual" | "market" }))} today={new Date().toISOString().slice(0, 10)} />
        </CardContent>
      </Card>
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Info
          icon={<Gauge />}
          title="Campaign links"
          body={`Use the dedicated link shown on each group: ${appUrl}/r/<group-slug>. The generic /r path is intentionally not a valid campaign destination.`}
        />
        <Info
          icon={<ShieldCheck />}
          title="Shopify webhook receiver"
          body={`${appUrl}/api/webhooks/shopify. In Shopify create Order creation and Order payment webhooks in JSON. This is never a group campaign link.`}
        />
        <Info
          icon={<ShieldCheck />}
          title="Secret handling"
          body="Webhook secrets and signing keys stay server-side. They are never shown in this interface."
        />
        <Info
          icon={<Settings2 />}
          title="Destination and routing configuration"
          body="Use Stores for Shopify identity and webhook setup. Use Products for direct links, then Product groups to rotate listings from any store with equal or custom verified-sales steps."
        />
      </section>
    </main>
  );
}

function Info({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-3 grid size-9 place-items-center border border-[#f2c96d]/30 bg-[#f2c96d]/10 text-[#f2c96d]">
          {icon}
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="break-all text-sm leading-6 text-muted-foreground">
          {body}
        </p>
      </CardContent>
    </Card>
  );
}
