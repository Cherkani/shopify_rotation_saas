# Milestone 1 — Two-store order rotator MVP

## Goal

Use one Facebook Ads URL to send visitors to one active Shopify store, count valid paid orders, and switch to the other store after five orders.

## Scope

- Two Shopify stores only.
- One Facebook Ads URL: `https://your-domain.com/r`.
- Threshold is a server-side constant: `ORDER_THRESHOLD = 5`.
- Supabase only; no Redis.
- No admin dashboard.

## Traffic flow

`GET /r` must:

1. Read the active store from Supabase.
2. Use the configured HTTPS Shopify URL.
3. Preserve every query parameter, including UTM parameters and `fbclid`.
4. Return a temporary `302` redirect.

The Facebook URL never changes when the active store changes.

## Webhook flow

Both Shopify stores send `orders/create` to:

`https://your-domain.com/api/webhooks/shopify`

The handler must verify HMAC, identify the store using Shopify's shop-domain header, accept only paid/authorized orders, prevent duplicate processing, and count the order for the originating store.

## Required database data

Create `stores`, `rotator_state`, `orders_log`, `webhook_events`, and `rotation_events` tables. Store A starts active and Store B is second in rotation.

The order count, threshold check, active-store update, and rotation log must run in one atomic Supabase PostgreSQL function/RPC.

## Expected behavior

```text
Paid orders 1–4 → Store A count increases
Paid order 5    → Store A reaches threshold; Store B becomes active
Next visitor   → redirected to Store B
```

Delayed Store A webhooks must still count for Store A, even after Store B becomes active.

## Acceptance criteria

- One Facebook URL redirects to Store A initially.
- All query parameters survive the redirect.
- Valid paid webhooks increment the correct store.
- Invalid HMAC requests are rejected.
- Unpaid orders are ignored.
- Duplicate Shopify events count only once.
- The fifth unique paid order switches stores.
- The next visitor reaches the new active store.
- Delayed webhooks are assigned to their originating store.
