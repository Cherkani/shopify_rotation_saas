# Milestone 08: Multi-Store Target Router MVP

Status: In progress

## Completed in this implementation

- Additive schema for independent store targets, caps, weights, health, and traffic controls.
- Target-balanced, equal-click, and weighted database allocation modes.
- One-hop redirect with preserved campaign parameters and an opaque `rt_click` attribution token.
- Multi-store Shopify webhook-secret map.
- HMAC-verified, idempotent paid-order ledger that links a validated click only to its selected store.
- Operator dashboard and store controls for target routing.

## Remaining delivery sequence

1. Apply the new migration in Supabase and move every webhook secret into `SHOPIFY_WEBHOOK_SECRETS_JSON`.
   Create a unique administrator before applying the default-admin disable migration.
2. Add Shopify order-state, cancellation, refund, and transaction webhook processing plus periodic Admin GraphQL reconciliation.
3. Capture `rt_click` as a cart attribute/order metafield with a Shopify app or theme extension for stronger cross-domain attribution.
4. Add webhook inbox/queue processing, retry visibility, and store health checks.
5. Implement Meta Pixel and Conversions API event mapping with browser/server `event_id` deduplication and consent controls.
6. Add allocation snapshots and Upstash Redis only after redirect latency or concurrent traffic measurements require it.
7. Load-test, security-review, and policy-review before production campaign traffic.

## Acceptance checks before live traffic

- All active stores have valid HTTPS destinations and server-only webhook secrets.
- Every store has a daily target/cap policy and an operator-designated fallback strategy.
- The router URL is the only ad destination and every storefront offers the same advertised product and price.
- Dashboard totals match a Shopify reconciliation sample.
- A paused or unhealthy store receives no new traffic.
