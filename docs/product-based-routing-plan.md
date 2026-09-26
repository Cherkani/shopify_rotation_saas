# Product-Based Routing Plan

## Objective

Replace the current store-based grouping with product-based routing.

The existing `/admin/routing` page will become the Product Groups administration page. A group will contain product listings from different stores, and campaign traffic will redirect directly to the selected product URL.

## New business model

```text
Product
  └── Store product listings
        ├── Store A → store-specific name + product URL
        ├── Store B → store-specific name + product URL
        └── Store C → store-specific name + product URL

Product group
  └── selected store-product listings
```

A global product represents the product identity. A store-product listing represents how that product is sold in a particular store.

Example:

```text
Product: Vitamin C Serum

Store A → Vitamin C Serum → https://store-a.com/products/vitamin-c
Store B → Vitamin C Face Serum → https://store-b.com/products/vitamin-c-serum
```

The same product can exist in multiple stores. A product group can contain product listings from multiple stores and may contain different products if the campaign requires it.

## Admin navigation

Add or update the sidebar with:

- Products
- Product Groups
- Stores
- Orders
- Analytics
- Settings

The existing `/admin/routing` route will be reused for Product Groups. Store management remains available under `/admin/stores` for store credentials, webhook configuration, and store status.

## Products page

The Products page will support:

1. Creating a global product.
2. Assigning the product to a store.
3. Saving the store-specific product name.
4. Saving the direct product URL.
5. Enabling or disabling a store-product listing.
6. Viewing which product groups use the listing.
7. Viewing product sales and attribution status.

The product URL must be a valid HTTPS URL. Store-product listings must reference an existing store and product.

## Product Groups page

The Product Groups page will support:

1. Creating a group name and URL slug.
2. Selecting a store.
3. Selecting one of that store's available product listings.
4. Adding the listing to the group.
5. Choosing the rotation order.
6. Choosing equal or custom verified-sales steps.
7. Pausing or enabling the group.
8. Removing or reordering group members.
9. Showing the currently active product listing and remaining sales.

Example group:

```text
Group: Summer Campaign
Route: /r/summer

1. Store A → Red Shoes → product link A
2. Store B → Red Shoes → product link B
3. Store C → Blue Shoes → product link C
```

## Routing behavior

The route will work as follows:

```text
/r/summer
  → load enabled product group
  → select active product-group member
  → create an opaque click ID
  → record group, member, product, and store
  → redirect directly to the product URL
```

The router will no longer redirect visitors to a store homepage or a generic store checkout URL.

Redirects will not consume a sales step. The active product listing remains active until it receives its configured number of verified paid sales.

## Rotation behavior

### Equal sales step

Every product-group member receives the same number of verified paid sales.

```text
Store A product → 2 paid sales
Store B product → 2 paid sales
Store C product → 2 paid sales
Repeat
```

### Custom sales step

Each product-group member can have its own verified-sales limit.

```text
Store A product → 1 paid sale
Store B product → 3 paid sales
Store C product → 2 paid sales
Repeat
```

After the active member reaches its limit, the group advances to the next eligible member and wraps back to the first member after the final member.

## Webhook and product attribution

The Shopify notification identifies the store using `x-shopify-shop-domain`. The product information comes from Shopify order `line_items`.

The processing flow will be:

```text
Shopify webhook
  → identify store from shop domain
  → verify the store's HMAC secret
  → deduplicate the webhook event
  → save the order
  → save every product line item
  → read and validate route attribution
  → connect the order to the product group and member
  → consume one verified sale for the correct active member
```

The route click ID will contain an opaque reference to the selected product-group member. The webhook processor will verify that the click belongs to the same store that sent the webhook.

The system must never infer the product group from the store alone. The store identifies where the order happened; the click attribution and order line items identify the campaign and product.

## Missing or unclear attribution

If a valid order has no usable route attribution:

- The order is still saved.
- All product line items are still saved.
- The order is marked as unattributed or requiring review.
- Product-group rotation is not advanced automatically.
- The order is not silently discarded.

This prevents sales from being lost while avoiding incorrect rotation changes.

## Database model

The new model will use the following entities:

### `products`

Global product identity.

- `id`
- `name`
- `slug`
- `enabled`
- timestamps

### `store_products`

The store-specific product listing.

- `id`
- `product_id`
- `store_id`
- `name`
- `product_url`
- `enabled`
- timestamps

### `product_groups`

The campaign group and its route configuration.

- `id`
- `name`
- `slug`
- `step_mode`
- `equal_step`
- `enabled`
- timestamps

### `product_group_members`

The product listings included in a group.

- `group_id`
- `store_product_id`
- `sequence_position`
- `step_count`
- `enabled`
- timestamps

### `product_group_state`

The live rotation state.

- `group_id`
- `active_member_id`
- `remaining_steps`
- timestamps

### `route_clicks`

The opaque route attribution record.

- click ID
- product group ID
- product-group member ID
- store-product ID
- store ID
- campaign parameters
- timestamp

### `orders_log`

The durable order record will retain the store reference and product snapshot, and will add attribution references where available.

It must preserve:

- Store ID
- Shopify order ID
- Shopify event ID
- Financial status
- Revenue and currency
- Landing URL
- Route click ID
- Product-group ID
- Product-group member ID
- Product line-item snapshot
- Rotation-counted status
- Attribution/review status

## Migration strategy

1. Add the new product, store-product, product-group, and group-member tables.
2. Keep all existing stores, webhook secrets, orders, and audit data.
3. Add product snapshots and attribution fields to order records.
4. Build the Products admin page.
5. Convert `/admin/routing` to Product Groups.
6. Update the router to redirect to direct product URLs.
7. Update webhook processing and verified-sales rotation.
8. Update orders, analytics, and dashboard filters.
9. Validate the new flow with test orders and duplicate webhook deliveries.
10. Retire the old store-only grouping logic after the new flow is confirmed.

Existing order history must not be deleted. Orders that cannot be connected to a new product group remain available as historical or unattributed orders.

## Safety requirements

- Verify every Shopify webhook using the secret belonging to the identified store.
- Deduplicate Shopify event IDs.
- Deduplicate `(store_id, shopify_order_id)`.
- Use database transactions for order saving and rotation updates.
- Lock group state while selecting or advancing the active member.
- Validate that a route click's store matches the webhook store.
- Save every valid product line item.
- Do not count refunds, cancelled orders, or unpaid orders as verified sales.
- Do not advance rotation when product-group attribution is ambiguous.
- Keep unmatched orders visible for review.
- Do not allow disabled stores, products, listings, or groups to receive new routed traffic.

## Testing requirements

Test cases will include:

- One product in multiple stores.
- Different product names and URLs for the same global product.
- A group containing products from different stores.
- Multiple product listings from the same store, if allowed by the final rules.
- Equal verified-sales rotation.
- Custom verified-sales rotation.
- Rotation wraparound.
- Disabled store or product listing.
- Missing webhook secret.
- Invalid webhook signature.
- Duplicate webhook event.
- Duplicate Shopify order.
- Order with multiple product line items.
- Order with missing landing attribution.
- Delayed order from a previous active product.
- Existing order history after migration.
- Route click from one store used with another store's webhook.

## Final success criteria

The implementation is complete when:

- Admins can create store-specific product listings.
- Admins can create product groups containing listings from different stores.
- Campaign links redirect directly to product URLs.
- Shopify orders clearly identify both the source store and sold products.
- Product-group rotation advances only for correctly attributed verified sales.
- No valid order or product line item is silently lost.
- Existing stores and order history remain intact.
- The new flow passes the migration, webhook, attribution, rotation, and reporting tests.
