# Milestone 7 — Production launch

## Goal

Run the rotator with real Facebook Ads traffic safely.

## Steps

1. Deploy a Vercel preview.
2. Point Shopify webhooks to preview.
3. Create test orders in both stores.
4. Verify the fifth-order switch.
5. Deploy production.
6. Point both Shopify webhook configurations to production.
7. Put the production `/r` URL in Facebook Ads.
8. Start with a small campaign.
9. Monitor redirects, webhook errors, duplicate events, and rotations.

## Launch checklist

- Production secrets are configured.
- Service-role keys are server-only.
- Shopify HMAC validation works in production.
- Both shop domains are mapped.
- Both stores have valid HTTPS URLs.
- A fallback policy exists if a store is disabled.
- Health checks and logs are working.
- The Vercel plan is appropriate for commercial usage.
