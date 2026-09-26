# Shopify Store Rotator

Next.js App Router application for rotating a dedicated product-group route across product listings hosted by independently configured Shopify stores.

## Current implementation

- Dedicated product-group links: `/r/<group-slug>`
- One product identity can have a direct HTTPS listing in multiple stores
- Product-group rotation using equal or custom verified-sale steps
- Supabase PostgreSQL state and atomic RPCs
- Shopify HMAC verification
- Duplicate webhook protection
- Opaque `rt_click` attribution IDs carried through Shopify cart attributes and linked to paid orders
- Strict tokenless-sale recovery when the configured Shopify product ID and a recent unused group click match
- Protected Supabase Auth admin dashboard
- Health endpoint: `/api/health`
- Daily/campaign redirect metrics stored in Supabase

Redis is intentionally optional. It is not required for the first production milestone.

## Required manual setup

1. Create a Supabase project.
2. Create the Shopify stores and confirm every `.myshopify.com` domain.
3. Create the required Shopify webhook configuration for each store.
4. Create a unique administrator record before enabling production traffic. No shared default administrator is safe.
5. Create a Vercel project and configure the Production environment variables.

## Environment variables

Copy `.env.example` to `.env.local` for local work and add the same values to Vercel Production:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_publishable_or_anon_key
SUPABASE_SECRET_KEY=your_server_only_secret_key
# Legacy fallback for older Supabase projects:
# SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
# One server-only JSON object containing every store's webhook secret.
SHOPIFY_WEBHOOK_SECRETS_JSON={"store-a.myshopify.com":"secret-a","store-b.myshopify.com":"secret-b"}
APP_URL=https://your-production-domain.com
ROUTER_CLICK_SIGNING_SECRET=replace_with_a_random_32_plus_character_secret
```

Do not commit `.env.local`, and never expose either server key with a `NEXT_PUBLIC_` prefix.

Never expose the JSON secret map with a `NEXT_PUBLIC_` prefix.

## Database setup

For a new database, run every migration in order. For an existing installation, apply the latest migrations, including `20260922150000_recover_tokenless_product_group_sales.sql` and `20260922160000_remove_legacy_store_routing.sql`. Then optionally run `supabase/seed.sql` for initial store identities and use `supabase/verify.sql` for read-only verification.

After the migration, configure each store and its Shopify webhook secret in `/admin/stores`, create direct product listings in `/admin/products`, then create a product group in `/admin/routing`. Enter the Shopify product ID for every listing that may need tokenless-sale recovery.

Create the first administrator locally, then run the printed SQL in the Supabase SQL Editor. Do not paste your password into the SQL editor or commit it anywhere.

```bash
ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD='use-a-unique-16-plus-character-password' npm run hash-admin-password
```

Run `supabase/migrations/20260921093000_disable_default_admin.sql` after creating your own administrator. It disables only the historical unchanged default account.

## Local commands

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

The repository CI workflow runs the same checks on Node.js 22 for every push to `main` and every pull request.

## Shopify webhook endpoint

Configure every store to send both `orders/create` and `orders/paid` to:

```text
https://your-production-domain.com/api/webhooks/shopify
```

The app uses `x-shopify-shop-domain` to identify the store and validates the HMAC using the matching server-side secret. Webhook delivery IDs and `(store, order)` uniqueness prevent duplicate order credit.

## Facebook Ads URL

Use one URL only:

```text
https://your-production-domain.com/r/<product-group-slug>
```

UTM parameters, `fbclid`, and other query parameters are forwarded to the selected product listing. The router replaces any incoming `rt_click` value with its own opaque click ID. It never detects Meta reviewers or changes the advertised product, price, or experience by visitor identity.

## Current MVP boundary

This release provides product-group routing and paid-sale attribution. Before relying on it for high-volume production campaigns, implement the next milestones: asynchronous webhook queueing, refund/cancellation updates, Shopify API reconciliation, product-link health probes, Meta Pixel and Conversions API setup, and load testing.
