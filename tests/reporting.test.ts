import assert from "node:assert/strict";
import test from "node:test";
import { rankProducts, type ReportOrder } from "../lib/reporting";

const members = [{ store_id: "a", group_id: "group1" }, { store_id: "b", group_id: "group1" }, { store_id: "c", group_id: "group2" }];
function order(store: string, title = "Travel Bag", currency = "USD"): ReportOrder {
  return { id: store, store_id: store, shopify_order_id: store, created_at: "2026-09-21T10:00:00Z", currency, total_price: 20,
    product_items: [{ id: store, productId: "product-" + store, title, sku: "sku-" + store, quantity: 2, gross: 20, discount: 2 }] };
}

test("same catalog product combines across group stores despite different Shopify IDs and SKUs", () => {
  const rows = rankProducts([order("a"), order("b", "  travel   BAG ")], members);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].units, 4);
  assert.equal(rows[0].orders, 2);
  assert.equal(rows[0].stores, 2);
  assert.equal(rows[0].revenue, 36);
});

test("different groups, currencies and distinct products remain separate", () => {
  assert.equal(rankProducts([order("a"), order("c")], members).length, 2);
  assert.equal(rankProducts([order("a"), order("b", "Travel Bag", "MAD")], members).length, 2);
  assert.equal(rankProducts([order("a"), order("b", "Phone Case")], members).length, 2);
  assert.equal(rankProducts([order("x"), order("y")], members).length, 2);
});

test("multiple variants in one order increase units but count the order once", () => {
  const sample = order("a");
  sample.product_items!.push({ ...sample.product_items![0], id: "variant2", sku: "blue" });
  const [row] = rankProducts([sample], members);
  assert.equal(row.units, 4);
  assert.equal(row.orders, 1);
  assert.equal(row.revenue, 36);
});

test("missing product details and unnamed products do not become a fabricated shared product", () => {
  assert.deepEqual(rankProducts([{ ...order("a"), product_items: null }], members), []);
  assert.equal(rankProducts([order("a", "Untitled product"), order("b", "Untitled product")], members).length, 2);
});
