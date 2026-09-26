import { NextResponse, type NextRequest } from "next/server";
import { getShopifyWebhookSecret } from "@/lib/env";
import { hashWebhookPayload, verifyShopifyHmac } from "@/lib/shopify/hmac";
import { decryptWebhookSecret } from "@/lib/shopify/webhook-secret";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { processShopifyOrder } from "@/lib/rotator";
import { extractProductItems } from "@/lib/shopify/product-items";
import { orderCreatedAtFromWebhook, routeClickFromOrder } from "@/lib/shopify/attribution";
import { normalizeCurrency, resolveReportingConversion } from "@/lib/currency";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

const ACCEPTED_TOPICS = new Set(["orders/create", "orders/paid"]);

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  const shopDomain = request.headers.get("x-shopify-shop-domain")?.toLowerCase().trim();
  const eventId = (request.headers.get("x-shopify-event-id") ?? request.headers.get("x-shopify-webhook-id"))?.trim();
  const topic = request.headers.get("x-shopify-topic")?.trim();
  const signature = request.headers.get("x-shopify-hmac-sha256");
  if (!topic || !ACCEPTED_TOPICS.has(topic) || !shopDomain || !eventId) {
    console.warn("Shopify webhook rejected: unexpected request headers", {
      hasShopDomain: Boolean(shopDomain),
      hasEventId: Boolean(eventId),
      topic,
    });
    return NextResponse.json({ error: "Invalid webhook" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, webhook_secret_ciphertext")
    .eq("shop_domain", shopDomain)
    .single();

  let webhookSecret: string | null = null;
  try {
    webhookSecret = store?.webhook_secret_ciphertext
      ? decryptWebhookSecret(store.webhook_secret_ciphertext)
      : getShopifyWebhookSecret(shopDomain);
  } catch {
    console.warn("Shopify webhook rejected: stored secret could not be decrypted", {
      shopDomain,
    });
    return NextResponse.json({ error: "Invalid webhook configuration" }, { status: 401 });
  }
  if (storeError || !store || !webhookSecret) {
    console.warn("Shopify webhook rejected: store or webhook secret not configured", {
      shopDomain,
      hasStore: Boolean(store),
      hasSecret: Boolean(webhookSecret),
      storeErrorCode: storeError?.code ?? null,
    });
    return NextResponse.json({ error: "Invalid webhook" }, { status: 401 });
  }
  if (!verifyShopifyHmac(rawBody, signature, webhookSecret)) {
    console.warn("Shopify webhook rejected: HMAC signature did not match saved secret", {
      shopDomain,
      eventId,
      topic,
    });
    return NextResponse.json({ error: "Invalid webhook" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orderId = String(payload.id ?? "");
  const financialStatus = String(payload.financial_status ?? "").toLowerCase();
  if (!orderId) return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
  if (financialStatus !== "paid") {
    return NextResponse.json({ accepted: false, reason: "order_not_paid" });
  }

  const parsedTotalPrice = payload.total_price == null ? null : Number(payload.total_price);
  if (parsedTotalPrice !== null && !Number.isFinite(parsedTotalPrice)) {
    return NextResponse.json({ error: "Invalid order total" }, { status: 400 });
  }

  const landingSite = payload.landing_site == null ? null : String(payload.landing_site);
  const routeClick = routeClickFromOrder(payload, shopDomain);
  let productItems;
  try {
    productItems = extractProductItems(payload.line_items);
  } catch {
    return NextResponse.json({ error: "Invalid product line items" }, { status: 400 });
  }
  if (productItems === null) {
    console.warn("Shopify order has no line_items; product reporting unavailable for this delivery", {
      shopDomain, eventId, topic,
    });
  }
  const result = await processShopifyOrder({
    eventId,
    storeId: store.id,
    orderId,
    totalPrice: parsedTotalPrice,
    currency: payload.currency == null ? null : String(payload.currency),
    landingSite,
    financialStatus,
    payloadHash: hashWebhookPayload(rawBody),
    productItems,
    routeClick,
    orderCreatedAt: orderCreatedAtFromWebhook(payload),
    topic: topic as "orders/create" | "orders/paid",
  });

  // Conversion is deliberately after order capture. A reporting-provider outage
  // must never lose a paid sale or delay the group rotation transaction.
  const sourceCurrency = normalizeCurrency(payload.currency == null ? null : String(payload.currency));
  const { data: settings } = await supabase
    .from("rotator_settings")
    .select("reporting_currency")
    .eq("id", true)
    .maybeSingle();
  const reportingCurrency = normalizeCurrency(settings?.reporting_currency) ?? "USD";
  const orderDate = (orderCreatedAtFromWebhook(payload) ?? new Date().toISOString()).slice(0, 10);
  const conversion = await resolveReportingConversion(supabase, {
    amount: parsedTotalPrice,
    fromCurrency: sourceCurrency,
    toCurrency: reportingCurrency,
    date: orderDate,
  });
  if (conversion) {
    const { error: conversionError } = await supabase
      .from("orders_log")
      .update({
        reporting_total: conversion.total,
        reporting_currency: reportingCurrency,
        exchange_rate: conversion.rate,
        exchange_rate_date: conversion.rateDate,
        exchange_source: conversion.source,
      })
      .eq("store_id", store.id)
      .eq("shopify_order_id", orderId);
    if (conversionError) console.warn("Shopify order saved but reporting conversion could not be stored", { eventId, code: conversionError.code });
  }

  console.info("Shopify order processed", { eventId, shopDomain, duplicate: result.duplicate, productLineCount: productItems?.length ?? null });
  return NextResponse.json({ accepted: true, ...result, productDetailsReceived: productItems !== null });
}
