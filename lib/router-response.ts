import { NextResponse, type NextRequest } from "next/server";
import { recordTargetRedirect } from "@/lib/rotator";

export async function resolveRouterRedirect(request: NextRequest, groupSlug?: string) {
  try {
    const params = request.nextUrl.searchParams;
    const selection = await recordTargetRedirect({ groupSlug, source: params.get("utm_source") ?? "", campaign: params.get("utm_campaign") ?? "", medium: params.get("utm_medium") ?? "" });
    const destination = new URL(selection.product_url);
    for (const [key, value] of params.entries()) if (key !== "rt_click") destination.searchParams.append(key, value);
    destination.searchParams.set("rt_click", selection.rt_click);
    const matchesShopifyStore = destination.hostname.toLowerCase() === selection.shop_domain.toLowerCase();
    const attributionBridge = matchesShopifyStore ? new URL("/cart/update", destination.origin) : destination;
    if (matchesShopifyStore) {
      attributionBridge.searchParams.set("attributes[rotator_rt_click]", selection.rt_click);
      attributionBridge.searchParams.set("return_to", `${destination.pathname}${destination.search}`);
    }
    const response = NextResponse.redirect(attributionBridge, 302);
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return response;
  } catch (error) {
    console.error("Redirect resolution failed", error);
    return NextResponse.json({ error: "Traffic destination temporarily unavailable" }, { status: 503 });
  }
}
