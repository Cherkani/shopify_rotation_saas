"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearAdminSession } from "@/lib/admin-auth";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/shopify/webhook-secret";
import { isReportingCurrency, normalizeCurrency, refreshMarketRates, resolveReportingConversion } from "@/lib/currency";

async function audit(
  actorEmail: string,
  action: string,
  details: Record<string, unknown>,
) {
  const supabase = createAdminSupabaseClient();
  await supabase
    .from("admin_audit_logs")
    .insert({ actor_email: actorEmail, action, details });
}

async function rebuildReportingProjection(supabase: ReturnType<typeof createAdminSupabaseClient>, reportingCurrency: string) {
  const { data: orders, error: ordersError } = await supabase
    .from("orders_log")
    .select("id, total_price, currency, created_at")
    .order("created_at", { ascending: false })
    .limit(5_000);
  if (ordersError) throw new Error("Existing sales could not be loaded for conversion");
  const conversions = new Map<string, Awaited<ReturnType<typeof resolveReportingConversion>>>();
  for (const order of orders ?? []) {
    const sourceCurrency = normalizeCurrency(order.currency);
    const date = String(order.created_at).slice(0, 10);
    const key = `${sourceCurrency ?? "unknown"}:${date}`;
    if (!conversions.has(key)) {
      conversions.set(key, await resolveReportingConversion(supabase, {
        amount: Number(order.total_price ?? 0),
        fromCurrency: sourceCurrency,
        toCurrency: reportingCurrency,
        date,
      }));
    }
  }
  let converted = 0;
  for (const order of orders ?? []) {
    const sourceCurrency = normalizeCurrency(order.currency);
    const date = String(order.created_at).slice(0, 10);
    const conversion = conversions.get(`${sourceCurrency ?? "unknown"}:${date}`);
    if (!conversion) continue;
    const { error: updateError } = await supabase.from("orders_log").update({
      reporting_total: Math.round((Number(order.total_price ?? 0) * conversion.rate + Number.EPSILON) * 100) / 100,
      reporting_currency: reportingCurrency,
      exchange_rate: conversion.rate,
      exchange_rate_date: conversion.rateDate,
      exchange_source: conversion.source,
    }).eq("id", order.id);
    if (updateError) throw new Error("An existing sale could not be converted");
    converted += 1;
  }
  return { converted, total: (orders ?? []).length };
}

export async function updateReportingCurrencyAction(formData: FormData) {
  const user = await requireAdmin();
  const reportingCurrency = String(formData.get("reportingCurrency") ?? "").trim().toUpperCase();
  if (!isReportingCurrency(reportingCurrency)) {
    throw new Error("Choose one of the supported reporting currencies");
  }
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("rotator_settings")
    .upsert({ id: true, reporting_currency: reportingCurrency, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  const marketRates = await refreshMarketRates(supabase, reportingCurrency);
  const { converted } = await rebuildReportingProjection(supabase, reportingCurrency);
  await audit(user.email ?? "unknown", "update_reporting_currency", { reportingCurrency, converted, marketRates });
  revalidatePath("/admin");
  revalidatePath("/admin/analytics");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/settings");
  return { message: `Reporting currency saved as ${reportingCurrency}. ${marketRates} market rates loaded and ${converted} saved sale${converted === 1 ? "" : "s"} converted.` };
}

export async function refreshMarketRatesAction() {
  const user = await requireAdmin();
  const supabase = createAdminSupabaseClient();
  const { data: settings } = await supabase.from("rotator_settings").select("reporting_currency").eq("id", true).maybeSingle();
  const reportingCurrency = normalizeCurrency(settings?.reporting_currency) ?? "USD";
  const marketRates = await refreshMarketRates(supabase, reportingCurrency);
  await audit(user.email ?? "unknown", "refresh_market_rates", { reportingCurrency, marketRates });
  revalidatePath("/admin/settings");
  return { message: `${marketRates} market rates loaded for ${reportingCurrency}.` };
}

export async function saveCurrencyRateAction(formData: FormData) {
  const user = await requireAdmin();
  const baseCurrency = normalizeCurrency(String(formData.get("baseCurrency") ?? ""));
  const quoteCurrency = normalizeCurrency(String(formData.get("quoteCurrency") ?? ""));
  const effectiveDate = String(formData.get("effectiveDate") ?? "");
  const rate = Number(formData.get("rate"));
  if (!baseCurrency || !quoteCurrency || baseCurrency === quoteCurrency) throw new Error("Choose two different valid currencies");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new Error("Enter a valid effective date");
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Enter an exchange rate greater than zero");
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase.from("currency_rates").upsert({
    base_currency: baseCurrency,
    quote_currency: quoteCurrency,
    effective_date: effectiveDate,
    rate,
    source: "manual",
    provider_date: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "base_currency,quote_currency,effective_date" });
  if (error) throw new Error(error.message);
  const { data: settings } = await supabase.from("rotator_settings").select("reporting_currency").eq("id", true).maybeSingle();
  const reportingCurrency = normalizeCurrency(settings?.reporting_currency) ?? "USD";
  const { converted } = await rebuildReportingProjection(supabase, reportingCurrency);
  await audit(user.email ?? "unknown", "save_currency_rate", { baseCurrency, quoteCurrency, effectiveDate, rate, converted });
  revalidatePath("/admin");
  revalidatePath("/admin/analytics");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/settings");
  return { message: `Manual ${baseCurrency} → ${quoteCurrency} rate saved. ${converted} sale${converted === 1 ? "" : "s"} refreshed.` };
}

export async function toggleStoreAction(formData: FormData) {
  const user = await requireAdmin();
  const storeId = String(formData.get("storeId") ?? "");
  const enabled = String(formData.get("enabled")) === "true";
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("stores")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", storeId);
  if (error) throw new Error(error.message);
  await audit(
    user.email ?? "unknown",
    enabled ? "enable_store" : "disable_store",
    { storeId },
  );
  revalidatePath("/admin");
  revalidatePath("/admin/stores");
  revalidatePath("/admin/routing");
}

export async function deleteStoreAction(formData: FormData) {
  const user = await requireAdmin();
  const storeId = String(formData.get("storeId") ?? "");
  if (!storeId) throw new Error("Store is required");
  const supabase = createAdminSupabaseClient();
  const [
    { data: store },
    { count: productCount },
    { count: orderCount },
    { count: clickCount },
    { count: webhookCount },
    { count: metricCount },
    { count: rotationCount },
  ] = await Promise.all([
    supabase.from("stores").select("id, name").eq("id", storeId).maybeSingle(),
    supabase
      .from("store_products")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId),
    supabase
      .from("orders_log")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId),
    supabase
      .from("route_clicks")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId),
    supabase
      .from("webhook_events")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId),
    supabase
      .from("redirect_metrics")
      .select("store_id", { count: "exact", head: true })
      .eq("store_id", storeId),
    supabase
      .from("rotation_events")
      .select("id", { count: "exact", head: true })
      .or(`from_store_id.eq.${storeId},to_store_id.eq.${storeId}`),
  ]);
  if (!store) throw new Error("Store not found");
  if ((productCount ?? 0) > 0)
    throw new Error("Remove this store's product listings before deleting it");
  if (
    (orderCount ?? 0) +
      (clickCount ?? 0) +
      (webhookCount ?? 0) +
      (metricCount ?? 0) +
      (rotationCount ?? 0) >
    0
  )
    throw new Error(
      "This store has history or routing references and cannot be deleted",
    );
  const { error } = await supabase.from("stores").delete().eq("id", storeId);
  if (error) throw new Error(error.message);
  await audit(user.email ?? "unknown", "delete_store", {
    storeId,
    name: store.name,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/stores");
  revalidatePath("/admin/products");
}

export async function createStoreAction(formData: FormData) {
  const user = await requireAdmin();
  const name = String(formData.get("storeName") ?? "").trim();
  const shopHandle = String(formData.get("shopHandle") ?? "")
    .trim()
    .toLowerCase();
  const shopDomain = `${shopHandle}.myshopify.com`;
  const checkoutUrl = `https://${shopDomain}`;
  const webhookSecret = String(formData.get("webhookSecret") ?? "").trim();

  if (!name || name.length > 100) throw new Error("Enter a store name");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(shopHandle))
    throw new Error("Enter the Shopify store link, for example kxwkxm-99");
  if (webhookSecret && webhookSecret.length < 8)
    throw new Error("Webhook secret must be at least 8 characters");

  const supabase = createAdminSupabaseClient();
  const [{ data: duplicateDomain }, { data: lastStore }] = await Promise.all([
    supabase
      .from("stores")
      .select("id")
      .eq("shop_domain", shopDomain)
      .maybeSingle(),
    supabase
      .from("stores")
      .select("rotation_position")
      .order("rotation_position", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (duplicateDomain)
    throw new Error("That Shopify domain is already assigned to another store");
  const { data: store, error } = await supabase
    .from("stores")
    .insert({
      name,
      shop_domain: shopDomain,
      checkout_url: checkoutUrl,
      rotation_position: Number(lastStore?.rotation_position ?? 0) + 1,
      webhook_secret_ciphertext: webhookSecret
        ? encryptWebhookSecret(webhookSecret)
        : null,
      webhook_secret_hint: webhookSecret ? webhookSecret.slice(-4) : null,
      daily_revenue_target: 0,
      daily_revenue_cap: null,
      traffic_weight: 1,
      enabled: false,
      accepting_traffic: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await audit(user.email ?? "unknown", "create_store", {
    storeId: store.id,
    name,
    shopDomain,
    checkoutUrl,
    webhookSecretHint: webhookSecret.slice(-4),
  });
  revalidatePath("/admin");
  revalidatePath("/admin/stores");
}

export async function updateStoreAction(formData: FormData) {
  const user = await requireAdmin();
  const storeId = String(formData.get("storeId") ?? "");
  const name = String(formData.get("storeName") ?? "").trim();
  const shopHandle = String(formData.get("shopHandle") ?? "")
    .trim()
    .toLowerCase();
  const shopDomain = `${shopHandle}.myshopify.com`;
  const checkoutUrl = `https://${shopDomain}`;
  const webhookSecret = String(formData.get("webhookSecret") ?? "").trim();

  if (
    !storeId ||
    !name ||
    name.length > 100 ||
    !/^[a-z0-9][a-z0-9-]{0,62}$/.test(shopHandle)
  )
    throw new Error("Enter a store name and Shopify store link");
  const supabase = createAdminSupabaseClient();
  const { data: duplicateDomain } = await supabase
    .from("stores")
    .select("id")
    .eq("shop_domain", shopDomain)
    .neq("id", storeId)
    .maybeSingle();
  if (duplicateDomain)
    throw new Error("That Shopify domain is already assigned to another store");
  const update: Record<string, unknown> = {
    name,
    shop_domain: shopDomain,
    checkout_url: checkoutUrl,
    updated_at: new Date().toISOString(),
  };
  if (webhookSecret) {
    if (webhookSecret.length < 8)
      throw new Error("Webhook secret must be at least 8 characters");
    update.webhook_secret_ciphertext = encryptWebhookSecret(webhookSecret);
    update.webhook_secret_hint = webhookSecret.slice(-4);
  }
  const { error } = await supabase
    .from("stores")
    .update(update)
    .eq("id", storeId);
  if (error) throw new Error(error.message);
  await audit(user.email ?? "unknown", "update_store_configuration", {
    storeId,
    name,
    shopDomain,
    checkoutUrl,
    webhookSecretUpdated: Boolean(webhookSecret),
  });
  revalidatePath("/admin");
  revalidatePath("/admin/stores");
  revalidatePath("/admin/routing");
}

function normalizeSlug(value: string) {
  return value
    .normalize("NFKD")
    .trim()
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateProductUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:")
      throw new Error("Product links must use HTTPS");
    return url.toString();
  } catch {
    throw new Error("Enter a valid HTTPS product link");
  }
}

function optionalShopifyProductId(value: FormDataEntryValue | null) {
  const id = String(value ?? "").trim();
  if (!id) return null;
  if (!/^\d{1,32}$/.test(id))
    throw new Error("Shopify product ID must contain digits only");
  return id;
}

async function assertRoutableProductListings(
  storeProductIds: string[],
  currentGroupId?: string,
) {
  const uniqueIds = [...new Set(storeProductIds)];
  if (uniqueIds.length !== storeProductIds.length) {
    throw new Error("Choose each product listing only once");
  }

  const supabase = createAdminSupabaseClient();
  const [
    { data: listings, error: listingsError },
    { data: memberships, error: membershipsError },
  ] = await Promise.all([
    supabase
      .from("store_products")
      .select("id, product_id, enabled, store_id, shopify_product_id")
      .in("id", uniqueIds),
    supabase
      .from("product_group_members")
      .select("group_id, store_product_id")
      .in("store_product_id", uniqueIds),
  ]);
  if (listingsError || membershipsError)
    throw new Error("Could not validate product listings");
  if ((listings ?? []).length !== uniqueIds.length)
    throw new Error("One or more product listings no longer exist");
  if ((listings ?? []).some((listing) => !listing.shopify_product_id?.trim()))
    throw new Error(
      "Every selected product needs a saved Shopify Product ID before it can join a product group",
    );
  if (
    (memberships ?? []).some((member) => member.group_id !== currentGroupId)
  ) {
    throw new Error(
      "A selected product listing already belongs to another product group",
    );
  }

  const storeIds = [
    ...new Set((listings ?? []).map((listing) => listing.store_id)),
  ];
  const productIds = [
    ...new Set((listings ?? []).map((listing) => listing.product_id)),
  ];
  const [
    { data: stores, error: storesError },
    { data: products, error: productsError },
  ] = await Promise.all([
    supabase
      .from("stores")
      .select("id, enabled, webhook_secret_hint")
      .in("id", storeIds),
    supabase.from("products").select("id, enabled").in("id", productIds),
  ]);
  if (storesError || productsError)
    throw new Error("Could not validate product-listing stores");
  const storeById = new Map((stores ?? []).map((store) => [store.id, store]));
  const productById = new Map(
    (products ?? []).map((product) => [product.id, product]),
  );
  if (
    (listings ?? []).some(
      (listing) =>
        !listing.enabled ||
        !productById.get(listing.product_id)?.enabled ||
        !storeById.get(listing.store_id)?.enabled ||
        !storeById.get(listing.store_id)?.webhook_secret_hint,
    )
  ) {
    throw new Error(
      "Every selected product listing must be enabled and belong to an active store with a Shopify webhook key",
    );
  }
}

export async function createProductAction(formData: FormData) {
  const user = await requireAdmin();
  const name = String(formData.get("productName") ?? "").trim();
  const storeId = String(formData.get("storeId") ?? "");
  const productUrl = validateProductUrl(
    String(formData.get("productUrl") ?? "").trim(),
  );
  const shopifyProductId = optionalShopifyProductId(
    formData.get("shopifyProductId"),
  );
  if (!name || name.length > 160) throw new Error("Enter a valid product name");
  if (!storeId) throw new Error("Choose a store");
  const supabase = createAdminSupabaseClient();
  const { data: store } = await supabase
    .from("stores")
    .select("id, webhook_secret_hint")
    .eq("id", storeId)
    .maybeSingle();
  if (!store) throw new Error("Selected store was not found");
  if (!store.webhook_secret_hint)
    throw new Error("Configure this store’s Shopify webhook before adding products");
  const baseSlug = normalizeSlug(name).slice(0, 56) || "product";
  let slug = baseSlug;
  const { data: existingSlug } = await supabase
    .from("products")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existingSlug) slug = `${baseSlug}-${crypto.randomUUID().slice(0, 7)}`;
  const { data: product, error } = await supabase
    .from("products")
    .insert({ name, slug })
    .select("id")
    .single();
  if (error || !product)
    throw new Error(error?.message ?? "Could not create product");
  const { error: listingError } = await supabase
    .from("store_products")
    .insert({
      product_id: product.id,
      store_id: storeId,
      product_url: productUrl,
      shopify_product_id: shopifyProductId,
    });
  if (listingError) throw new Error(listingError.message);
  await audit(user.email ?? "unknown", "create_product", {
    productId: product.id,
    name,
    slug,
    storeId,
    productUrl,
    shopifyProductId,
  });
  revalidatePath("/admin/products");
  revalidatePath("/admin/routing");
}

export async function addStoreProductAction(formData: FormData) {
  const user = await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const storeId = String(formData.get("storeId") ?? "");
  const productUrl = validateProductUrl(
    String(formData.get("productUrl") ?? "").trim(),
  );
  const shopifyProductId = optionalShopifyProductId(
    formData.get("shopifyProductId"),
  );
  if (!productId || !storeId)
    throw new Error("Product and store are required");
  const supabase = createAdminSupabaseClient();
  const { data: store } = await supabase
    .from("stores")
    .select("id, webhook_secret_hint")
    .eq("id", storeId)
    .maybeSingle();
  if (!store) throw new Error("Selected store was not found");
  if (!store.webhook_secret_hint)
    throw new Error("Configure this store’s Shopify webhook before adding products");
  const { error } = await supabase
    .from("store_products")
    .insert({
      product_id: productId,
      store_id: storeId,
      product_url: productUrl,
      shopify_product_id: shopifyProductId,
    });
  if (error)
    throw new Error(
      error.message.includes("store_products_product_id_store_id_key")
        ? "This product is already configured for that store"
        : error.message,
    );
  await audit(user.email ?? "unknown", "add_store_product", {
    productId,
    storeId,
    productUrl,
    shopifyProductId,
  });
  revalidatePath("/admin/products");
  revalidatePath("/admin/routing");
}

export async function updateStoreProductTrackingAction(formData: FormData) {
  const user = await requireAdmin();
  const storeProductId = String(formData.get("storeProductId") ?? "");
  if (!storeProductId) throw new Error("Product listing is required");
  const shopifyProductId = optionalShopifyProductId(
    formData.get("shopifyProductId"),
  );
  const supabase = createAdminSupabaseClient();
  const { error } = await supabase
    .from("store_products")
    .update({
      shopify_product_id: shopifyProductId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", storeProductId);
  if (error) {
    if (error.message.includes("store_products_store_shopify_product_idx")) {
      throw new Error("This Shopify Product ID is already assigned to another product in this store. Use the ID from the exact Shopify product page, or remove it from the other listing first.");
    }
    throw new Error(error.message);
  }
  await audit(user.email ?? "unknown", "update_store_product_tracking", {
    storeProductId,
    shopifyProductId,
  });
  revalidatePath("/admin/products");
}

export async function updateProductListingAction(formData: FormData) {
  const user = await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const storeProductId = String(formData.get("storeProductId") ?? "");
  const productName = String(formData.get("productName") ?? "").trim();
  const productUrl = validateProductUrl(
    String(formData.get("productUrl") ?? "").trim(),
  );
  const shopifyProductId = optionalShopifyProductId(
    formData.get("shopifyProductId"),
  );
  if (
    !productId ||
    !storeProductId ||
    !productName ||
    productName.length > 160
  ) {
    throw new Error("Enter a valid product name");
  }
  const supabase = createAdminSupabaseClient();
  const { data: listing } = await supabase
    .from("store_products")
    .select("id")
    .eq("id", storeProductId)
    .eq("product_id", productId)
    .maybeSingle();
  if (!listing) throw new Error("Product listing was not found");
  const timestamp = new Date().toISOString();
  const [{ error: productError }, { error: listingError }] = await Promise.all([
    supabase
      .from("products")
      .update({ name: productName, updated_at: timestamp })
      .eq("id", productId),
    supabase
      .from("store_products")
      .update({
        product_url: productUrl,
        shopify_product_id: shopifyProductId,
        updated_at: timestamp,
      })
      .eq("id", storeProductId),
  ]);
  if (productError || listingError)
    throw new Error(
      productError?.message ??
        listingError?.message ??
        "Could not update product",
    );
  await audit(user.email ?? "unknown", "update_product_listing", {
    productId,
    storeProductId,
    productName,
    productUrl,
    shopifyProductId,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/admin/routing");
}

export async function toggleStoreProductAction(formData: FormData) {
  const user = await requireAdmin();
  const id = String(formData.get("storeProductId") ?? "");
  const enabled = String(formData.get("enabled")) === "true";
  const supabase = createAdminSupabaseClient();
  if (!enabled) {
    const { data: memberships, error: membershipError } = await supabase
      .from("product_group_members")
      .select("group_id")
      .eq("store_product_id", id);
    if (membershipError) throw new Error(membershipError.message);
    const groupIds = (memberships ?? []).map(
      (membership) => membership.group_id,
    );
    if (groupIds.length) {
      const { data: groups, error: groupsError } = await supabase
        .from("product_groups")
        .select("id")
        .eq("enabled", true)
        .in("id", groupIds);
      if (groupsError) throw new Error(groupsError.message);
      if (groups?.length)
        throw new Error(
          "Pause or edit the product group before disabling one of its active listings",
        );
    }
  }
  const { error } = await supabase
    .from("store_products")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await audit(
    user.email ?? "unknown",
    enabled ? "enable_store_product" : "disable_store_product",
    { storeProductId: id },
  );
  revalidatePath("/admin/products");
  revalidatePath("/admin/routing");
}

export async function deleteStoreProductAction(formData: FormData) {
  const user = await requireAdmin();
  const storeProductId = String(formData.get("storeProductId") ?? "");
  if (!storeProductId) throw new Error("Product listing is required");
  const supabase = createAdminSupabaseClient();
  const { data: listing } = await supabase
    .from("store_products")
    .select("id, product_id, store_id")
    .eq("id", storeProductId)
    .maybeSingle();
  if (!listing) throw new Error("Product listing was not found");
  const [{ count: membershipCount }, { count: orderCount }, { count: clickCount }] =
    await Promise.all([
      supabase.from("product_group_members").select("group_id", { count: "exact", head: true }).eq("store_product_id", storeProductId),
      supabase.from("orders_log").select("id", { count: "exact", head: true }).eq("store_product_id", storeProductId),
      supabase.from("route_clicks").select("id", { count: "exact", head: true }).eq("product_group_member_store_product_id", storeProductId),
    ]);
  if ((membershipCount ?? 0) > 0)
    throw new Error("Remove this listing from its product group before deleting it");
  if ((orderCount ?? 0) + (clickCount ?? 0) > 0)
    throw new Error("This listing has routing or sales history and cannot be deleted");
  const { error } = await supabase.from("store_products").delete().eq("id", storeProductId);
  if (error) throw new Error(error.message);
  const { count: remainingListings } = await supabase
    .from("store_products").select("id", { count: "exact", head: true }).eq("product_id", listing.product_id);
  if ((remainingListings ?? 0) === 0) {
    const { error: productError } = await supabase.from("products").delete().eq("id", listing.product_id);
    if (productError) throw new Error(productError.message);
  }
  await audit(user.email ?? "unknown", "delete_store_product", { storeProductId, productId: listing.product_id, storeId: listing.store_id });
  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/admin/routing");
}

export async function createProductGroupAction(formData: FormData) {
  const user = await requireAdmin();
  const name = String(formData.get("groupName") ?? "").trim();
  const slug = normalizeSlug(String(formData.get("groupSlug") ?? ""));
  const stepMode = String(formData.get("stepMode") ?? "equal_step");
  const equalStep = Number(formData.get("equalStep") ?? 1);
  const storeProductIds = formData
    .getAll("storeProductIds")
    .map(String)
    .filter(Boolean);
  if (!name || name.length > 100 || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug))
    throw new Error("Enter a valid group name and slug");
  if (
    !["equal_step", "custom_step"].includes(stepMode) ||
    !Number.isInteger(equalStep) ||
    equalStep < 1
  )
    throw new Error("Enter valid sales-step settings");
  if (!storeProductIds.length)
    throw new Error("Choose at least one store product");
  await assertRoutableProductListings(storeProductIds);
  const supabase = createAdminSupabaseClient();
  const { data: group, error } = await supabase
    .from("product_groups")
    .insert({ name, slug, step_mode: stepMode, equal_step: equalStep })
    .select("id")
    .single();
  if (error || !group)
    throw new Error(error?.message ?? "Could not create product group");
  const rows = storeProductIds.map((storeProductId, index) => ({
    group_id: group.id,
    store_product_id: storeProductId,
    sequence_position: index + 1,
    step_count:
      stepMode === "equal_step"
        ? equalStep
        : Number(formData.get(`step:${storeProductId}`) ?? 1),
  }));
  if (
    rows.some((row) => !Number.isInteger(row.step_count) || row.step_count < 1)
  )
    throw new Error("Every product step must be a positive whole number");
  const { error: memberError } = await supabase
    .from("product_group_members")
    .insert(rows);
  if (memberError) throw new Error(memberError.message);
  await supabase
    .from("product_group_state")
    .insert({ group_id: group.id, remaining_steps: 0 });
  await audit(user.email ?? "unknown", "create_product_group", {
    groupId: group.id,
    name,
    slug,
    stepMode,
    equalStep,
    storeProductIds,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/routing");
}

export async function toggleProductGroupAction(formData: FormData) {
  const user = await requireAdmin();
  const groupId = String(formData.get("groupId") ?? "");
  const enabled = String(formData.get("enabled")) === "true";
  const supabase = createAdminSupabaseClient();
  if (enabled) {
    const { data: members } = await supabase
      .from("product_group_members")
      .select("store_product_id")
      .eq("group_id", groupId);
    const ids = (members ?? []).map((member) => member.store_product_id);
    if (!ids.length)
      throw new Error(
        "Add at least one product listing before enabling this group",
      );
    await assertRoutableProductListings(ids, groupId);
  }
  const { error } = await supabase
    .from("product_groups")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", groupId);
  if (error) throw new Error(error.message);
  await audit(
    user.email ?? "unknown",
    enabled ? "enable_product_group" : "disable_product_group",
    { groupId },
  );
  revalidatePath("/admin");
  revalidatePath("/admin/routing");
}

export async function removeProductGroupMemberAction(formData: FormData) {
  const user = await requireAdmin();
  const groupId = String(formData.get("groupId") ?? "");
  const storeProductId = String(formData.get("storeProductId") ?? "");
  const supabase = createAdminSupabaseClient();
  const { count, error: countError } = await supabase
    .from("product_group_members")
    .select("store_product_id", { count: "exact", head: true })
    .eq("group_id", groupId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) <= 1)
    throw new Error(
      "A product group must keep at least one listing. Use Edit group to replace it.",
    );
  const { error } = await supabase
    .from("product_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("store_product_id", storeProductId);
  if (error) throw new Error(error.message);
  await supabase
    .from("product_group_state")
    .update({
      active_member_group_id: null,
      active_member_store_product_id: null,
      remaining_steps: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("group_id", groupId)
    .eq("active_member_store_product_id", storeProductId);
  await audit(user.email ?? "unknown", "remove_product_group_member", {
    groupId,
    storeProductId,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/routing");
}

export async function addProductGroupMemberAction(formData: FormData) {
  const user = await requireAdmin();
  const groupId = String(formData.get("groupId") ?? "");
  const storeProductId = String(formData.get("storeProductId") ?? "");
  const requestedStep = Number(formData.get("stepCount") ?? 1);
  if (
    !groupId ||
    !storeProductId ||
    !Number.isInteger(requestedStep) ||
    requestedStep < 1
  )
    throw new Error("Choose a product listing and a valid sales step");
  const supabase = createAdminSupabaseClient();
  const [
    { data: group },
    { data: listing },
    { count },
    { data: existingMembers },
    { count: assignedElsewhere },
  ] = await Promise.all([
    supabase
      .from("product_groups")
      .select("id, step_mode, equal_step")
      .eq("id", groupId)
      .maybeSingle(),
    supabase
      .from("store_products")
      .select("id, enabled, store_id, shopify_product_id")
      .eq("id", storeProductId)
      .maybeSingle(),
    supabase
      .from("product_group_members")
      .select("store_product_id", { count: "exact", head: true })
      .eq("group_id", groupId),
    supabase
      .from("product_group_members")
      .select("step_count")
      .eq("group_id", groupId)
      .order("sequence_position")
      .limit(1),
    supabase
      .from("product_group_members")
      .select("store_product_id", { count: "exact", head: true })
      .eq("store_product_id", storeProductId),
  ]);
  if (!group || !listing?.enabled)
    throw new Error("This group or product listing is not available");
  if (!listing.shopify_product_id?.trim())
    throw new Error("Save this product’s Shopify Product ID before adding it to a product group");
  if (assignedElsewhere)
    throw new Error(
      "This product listing is already assigned to a product group",
    );
  const { data: store } = await supabase
    .from("stores")
    .select("enabled, webhook_secret_hint")
    .eq("id", listing.store_id)
    .maybeSingle();
  if (!store?.enabled || !store.webhook_secret_hint)
    throw new Error(
      "The listing’s store must be active and have a Shopify webhook key before it can join a route",
    );
  const stepCount =
    group.step_mode === "equal_step"
      ? group.equal_step
      : (existingMembers?.[0]?.step_count ?? requestedStep);
  const { error } = await supabase
    .from("product_group_members")
    .insert({
      group_id: groupId,
      store_product_id: storeProductId,
      sequence_position: (count ?? 0) + 1,
      step_count: stepCount,
    });
  if (error)
    throw new Error(
      error.message.includes("product_group_members_pkey")
        ? "This product listing is already in the group"
        : error.message,
    );
  await audit(user.email ?? "unknown", "add_product_group_member", {
    groupId,
    storeProductId,
    stepCount,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/routing");
}

export async function updateProductGroupAction(formData: FormData) {
  const user = await requireAdmin();
  const groupId = String(formData.get("groupId") ?? "");
  const name = String(formData.get("groupName") ?? "").trim();
  const slug = normalizeSlug(String(formData.get("groupSlug") ?? ""));
  const stepMode = String(formData.get("stepMode") ?? "equal_step");
  const equalStep = Number(formData.get("equalStep") ?? 1);
  if (
    !groupId ||
    !name ||
    name.length > 100 ||
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)
  )
    throw new Error("Enter a valid group name and link slug");
  if (
    !["equal_step", "custom_step"].includes(stepMode) ||
    !Number.isInteger(equalStep) ||
    equalStep < 1
  )
    throw new Error("Enter a valid sales step");
  const supabase = createAdminSupabaseClient();
  const selectedIds = formData
    .getAll("storeProductIds")
    .map(String)
    .filter(Boolean);
  if (!selectedIds.length)
    throw new Error("Choose at least one product listing");
  await assertRoutableProductListings(selectedIds, groupId);
  const [{ data: groupBefore }, { data: stateBefore }, { data: members }] =
    await Promise.all([
      supabase
        .from("product_groups")
        .select("step_mode, equal_step")
        .eq("id", groupId)
        .maybeSingle(),
      supabase
        .from("product_group_state")
        .select(
          "active_member_store_product_id, remaining_steps, rotation_round",
        )
        .eq("group_id", groupId)
        .maybeSingle(),
      supabase
        .from("product_group_members")
        .select("store_product_id, step_count")
        .eq("group_id", groupId),
    ]);
  const currentIds = new Set(
    (members ?? []).map((member) => member.store_product_id),
  );
  const steps = selectedIds.map((storeProductId) => ({
    storeProductId,
    stepCount:
      stepMode === "equal_step"
        ? equalStep
        : Number(formData.get(`step:${storeProductId}`) ?? 1),
  }));
  if (
    steps.some(
      (step) => !Number.isInteger(step.stepCount) || step.stepCount < 1,
    )
  )
    throw new Error("Every product step must be a positive whole number");
  const activeId = stateBefore?.active_member_store_product_id ?? null;
  const oldActiveMember = (members ?? []).find(
    (member) => member.store_product_id === activeId,
  );
  const newActiveStep =
    steps.find((step) => step.storeProductId === activeId)?.stepCount ?? null;
  const oldBaseStep =
    groupBefore?.step_mode === "equal_step"
      ? groupBefore.equal_step
      : (oldActiveMember?.step_count ?? null);
  const stepConfigurationChanged = Boolean(
    groupBefore &&
    (groupBefore.step_mode !== stepMode || oldBaseStep !== newActiveStep),
  );
  const oldRound = stateBefore?.rotation_round ?? 1;
  const currentStepSales =
    stateBefore && oldBaseStep
      ? Math.max(0, oldBaseStep * oldRound - stateBefore.remaining_steps)
      : 0;
  const { error } = await supabase
    .from("product_groups")
    .update({
      name,
      slug,
      step_mode: stepMode,
      equal_step: equalStep,
      updated_at: new Date().toISOString(),
    })
    .eq("id", groupId);
  if (error) throw new Error(error.message);
  const removed = [...currentIds].filter(
    (storeProductId) => !selectedIds.includes(storeProductId),
  );
  if (removed.length) {
    const { error: removeError } = await supabase
      .from("product_group_members")
      .delete()
      .eq("group_id", groupId)
      .in("store_product_id", removed);
    if (removeError) throw new Error(removeError.message);
    const { error: stateError } = await supabase
      .from("product_group_state")
      .update({
        active_member_group_id: null,
        active_member_store_product_id: null,
        remaining_steps: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("group_id", groupId)
      .in("active_member_store_product_id", removed);
    if (stateError) throw new Error(stateError.message);
  }
  const added = steps.filter((step) => !currentIds.has(step.storeProductId));
  if (added.length) {
    const { error: addError } = await supabase
      .from("product_group_members")
      .insert(
        added.map((step, index) => ({
          group_id: groupId,
          store_product_id: step.storeProductId,
          sequence_position: (members?.length ?? 0) + index + 1,
          step_count: step.stepCount,
        })),
      );
    if (addError) throw new Error(addError.message);
  }
  for (const [index, step] of steps.entries()) {
    const { error: memberError } = await supabase
      .from("product_group_members")
      .update({
        step_count: step.stepCount,
        sequence_position: index + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("group_id", groupId)
      .eq("store_product_id", step.storeProductId);
    if (memberError) throw new Error(memberError.message);
  }
  if (
    stepConfigurationChanged &&
    activeId &&
    newActiveStep &&
    selectedIds.includes(activeId)
  ) {
    const newRemaining = Math.max(1, newActiveStep - currentStepSales);
    const { error: stateError } = await supabase
      .from("product_group_state")
      .update({
        rotation_round: 1,
        remaining_steps: newRemaining,
        updated_at: new Date().toISOString(),
      })
      .eq("group_id", groupId)
      .eq("active_member_store_product_id", activeId);
    if (stateError) throw new Error(stateError.message);
  }
  await audit(user.email ?? "unknown", "update_product_group", {
    groupId,
    name,
    slug,
    stepMode,
    equalStep,
    steps,
  });
  revalidatePath("/admin");
  revalidatePath("/admin/routing");
}

export async function signOutAction() {
  await clearAdminSession();
  revalidatePath("/", "layout");
  redirect("/login");
}
