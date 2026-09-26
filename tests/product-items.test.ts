import assert from "node:assert/strict";
import test from "node:test";
import { extractProductItems } from "../lib/shopify/product-items";
import { utcTimestamp } from "../lib/display";

test("Shopify line items become a product snapshot without customer or custom-property data", () => {
  assert.deepEqual(extractProductItems([{ id: 7, product_id: 42, title: "Bag", sku: "BAG", quantity: 2, price: "15.00", discount_allocations: [{ amount: "3.00" }], properties: [{ name: "email", value: "private" }] }]),
    [{ id: "7", productId: "42", title: "Bag", sku: "BAG", quantity: 2, gross: 30, discount: 3 }]);
});

test("missing line items remain distinguishable from an empty list", () => {
  assert.equal(extractProductItems(undefined), null);
  assert.deepEqual(extractProductItems([]), []);
  assert.throws(() => extractProductItems([{ id: 1, quantity: 1, price: "invalid" }]));
});

test("timestamps always convert the original offset to UTC", () => {
  assert.equal(utcTimestamp("2026-09-21T23:15:00-04:00"), "2026-09-22 03:15:00 UTC");
  assert.equal(utcTimestamp("2026-09-21T20:00:00+01:00"), "2026-09-21 19:00:00 UTC");
});
