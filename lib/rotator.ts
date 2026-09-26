import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";
import type { ProductItem } from "@/lib/reporting";

type RedirectResult = {
  id: string;
  store_name: string;
  shop_domain: string;
  product_id: string;
  store_product_id: string;
  product_name: string;
  product_url: string;
  group_id: string;
  group_name: string;
  group_slug: string;
  rt_click: string;
};

export async function recordTargetRedirect(input: {
  groupSlug?: string;
  source?: string;
  campaign?: string;
  medium?: string;
}): Promise<RedirectResult> {
  const supabase = createAdminSupabaseClient();
  const clickId = randomUUID();
  const routeClick = randomUUID().replaceAll("-", "");
  const { data, error } = await supabase.rpc("record_product_group_redirect", {
    p_group_slug: input.groupSlug ?? "",
    p_click_id: clickId,
    p_rt_click: routeClick,
    p_source: input.source ?? "",
    p_campaign: input.campaign ?? "",
    p_medium: input.medium ?? "",
  });
  if (error) throw new Error(`Could not resolve product group destination: ${error.message}`);
  return { ...(data as RedirectResult), rt_click: routeClick };
}

export async function processShopifyOrder(input: {
  eventId: string;
  storeId: string;
  orderId: string;
  totalPrice: number | null;
  currency: string | null;
  landingSite: string | null;
  financialStatus: string;
  payloadHash: string;
  productItems: ProductItem[] | null;
  routeClick?: string | null;
  orderCreatedAt?: string | null;
  topic: "orders/create" | "orders/paid";
}) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.rpc("process_shopify_order_v9", {
    p_event_id: input.eventId,
    p_store_id: input.storeId,
    p_shopify_order_id: input.orderId,
    p_total_price: input.totalPrice,
    p_currency: input.currency,
    p_landing_site: input.landingSite,
    p_financial_status: input.financialStatus,
    p_payload_hash: input.payloadHash,
    p_product_items: input.productItems,
    p_route_click: input.routeClick ?? null,
    p_topic: input.topic,
    p_order_created_at: input.orderCreatedAt ?? null,
  });
  if (error) throw new Error(`Could not process Shopify order: ${error.message}`);
  return data as { duplicate: boolean; order_id?: string };
}
