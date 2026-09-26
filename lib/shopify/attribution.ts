const ROUTE_CLICK_PATTERN = /^[a-f0-9]{32}$/i;

function validRouteClick(value: unknown): string | null {
  const candidate = typeof value === "string" ? value.trim() : "";
  return ROUTE_CLICK_PATTERN.test(candidate) ? candidate.toLowerCase() : null;
}

export function routeClickFromOrder(payload: Record<string, unknown>, shopDomain: string): string | null {
  const attributes = payload.note_attributes;
  if (Array.isArray(attributes)) {
    for (const raw of attributes) {
      if (!raw || typeof raw !== "object") continue;
      const attribute = raw as Record<string, unknown>;
      if (attribute.name === "rotator_rt_click") {
        const routeClick = validRouteClick(attribute.value);
        if (routeClick) return routeClick;
      }
    }
  }

  const landingSite = payload.landing_site;
  if (typeof landingSite !== "string" || !landingSite.trim()) return null;
  try {
    return validRouteClick(new URL(landingSite, `https://${shopDomain}`).searchParams.get("rt_click"));
  } catch {
    return null;
  }
}

/**
 * Shopify timestamps are used only to ensure a tokenless-sale recovery never
 * selects a click that happened after the checkout was created.
 */
export function orderCreatedAtFromWebhook(payload: Record<string, unknown>): string | null {
  if (typeof payload.created_at !== "string" || !payload.created_at.trim()) return null;
  const timestamp = new Date(payload.created_at);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}
