import type { SupabaseClient } from "@supabase/supabase-js";

const fallbackCurrencies = ["USD", "MAD", "EUR", "GBP", "CAD", "AED", "SAR"];

export const reportingCurrencies = typeof Intl.supportedValuesOf === "function"
  ? Intl.supportedValuesOf("currency").filter((currency) => /^[A-Z]{3}$/.test(currency))
  : fallbackCurrencies;

export type ReportingCurrency = string;

export function normalizeCurrency(value: string | null | undefined): string | null {
  const currency = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

export function isReportingCurrency(value: string): value is ReportingCurrency {
  return reportingCurrencies.includes(value);
}

export type CurrencyConversion = { total: number; rate: number; rateDate: string; source: "market" | "manual" | "identity" };

export async function convertForReporting(input: {
  amount: number | null;
  fromCurrency: string | null;
  toCurrency: string;
  date: string;
}): Promise<CurrencyConversion | null> {
  const from = normalizeCurrency(input.fromCurrency);
  const to = normalizeCurrency(input.toCurrency);
  if (input.amount === null || !Number.isFinite(input.amount) || !from || !to) return null;
  if (from === to) return { total: input.amount, rate: 1, rateDate: input.date, source: "identity" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);
  try {
    const response = await fetch(
      `https://api.frankfurter.dev/v2/rate/${from.toLowerCase()}/${to.toLowerCase()}?date=${encodeURIComponent(input.date)}`,
      { signal: controller.signal, next: { revalidate: 3_600 } },
    );
    if (!response.ok) return null;
    const payload = await response.json() as { rate?: unknown; date?: unknown };
    const rate = Number(payload.rate);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return {
      total: Math.round((input.amount * rate + Number.EPSILON) * 100) / 100,
      rate,
      rateDate: typeof payload.date === "string" ? payload.date : input.date,
      source: "market",
    };
  } catch {
    // A rate outage must never prevent Shopify order capture or sales rotation.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveReportingConversion(db: SupabaseClient, input: {
  amount: number | null;
  fromCurrency: string | null;
  toCurrency: string;
  date: string;
}): Promise<CurrencyConversion | null> {
  const from = normalizeCurrency(input.fromCurrency);
  const to = normalizeCurrency(input.toCurrency);
  if (!from || !to) return null;
  if (from === to) return convertForReporting(input);

  const { data: savedRate } = await db.from("currency_rates")
    .select("rate, effective_date, source")
    .eq("base_currency", from)
    .eq("quote_currency", to)
    .lte("effective_date", input.date)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (savedRate) {
    const rate = Number(savedRate.rate);
    if (Number.isFinite(rate) && rate > 0 && input.amount !== null && Number.isFinite(input.amount)) {
      return {
        total: Math.round((input.amount * rate + Number.EPSILON) * 100) / 100,
        rate,
        rateDate: String(savedRate.effective_date),
        source: savedRate.source === "manual" ? "manual" : "market",
      };
    }
  }

  const market = await convertForReporting(input);
  if (!market) return null;
  const { error } = await db.from("currency_rates").upsert({
    base_currency: from,
    quote_currency: to,
    effective_date: input.date,
    rate: market.rate,
    source: "market",
    provider_date: market.rateDate,
    updated_at: new Date().toISOString(),
  }, { onConflict: "base_currency,quote_currency,effective_date" });
  if (error) console.warn("Exchange rate could not be cached", { from, to, code: error.code });
  return market;
}

export async function refreshMarketRates(db: SupabaseClient, reportingCurrency: string) {
  const quote = normalizeCurrency(reportingCurrency);
  if (!quote) throw new Error("Reporting currency is invalid");
  const response = await fetch(`https://api.frankfurter.dev/v2/rates?base=${quote.toLowerCase()}`, {
    next: { revalidate: 3_600 },
  });
  if (!response.ok) throw new Error("Market exchange rates could not be loaded");
  const payload = await response.json() as { date?: unknown; base?: unknown; quote?: unknown; rate?: unknown }[];
  const { data: manualRates, error: manualError } = await db.from("currency_rates")
    .select("base_currency, quote_currency, effective_date")
    .eq("quote_currency", quote)
    .eq("source", "manual");
  if (manualError) throw new Error("Saved manual exchange rates could not be loaded");
  const manualKeys = new Set((manualRates ?? []).map((row) => `${row.base_currency}:${row.quote_currency}:${row.effective_date}`));
  const rows = payload.flatMap((item) => {
    const base = normalizeCurrency(typeof item.base === "string" ? item.base : null);
    const currency = normalizeCurrency(typeof item.quote === "string" ? item.quote : null);
    const rate = Number(item.rate);
    const date = typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : null;
    if (!base || base !== quote || !currency || currency === quote || !date || !Number.isFinite(rate) || rate <= 0) return [];
    const key = `${currency}:${quote}:${date}`;
    if (manualKeys.has(key)) return [];
    return [{
      base_currency: currency,
      quote_currency: quote,
      effective_date: date,
      rate: 1 / rate,
      source: "market",
      provider_date: date,
      updated_at: new Date().toISOString(),
    }];
  });
  if (!rows.length) return 0;
  const { error } = await db.from("currency_rates").upsert(rows, { onConflict: "base_currency,quote_currency,effective_date" });
  if (error) throw new Error("Market exchange rates could not be saved");
  return rows.length;
}
