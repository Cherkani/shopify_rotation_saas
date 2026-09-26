import assert from "node:assert/strict";
import test from "node:test";
import { orderCreatedAtFromWebhook, routeClickFromOrder } from "@/lib/shopify/attribution";

const click = "0123456789abcdef0123456789abcdef";

test("reads an opaque route click from a relative Shopify landing URL", () => {
  assert.equal(routeClickFromOrder({ landing_site: `/products/berry?rt_click=${click}` }, "store.myshopify.com"), click);
});

test("prefers the persisted cart attribute when Shopify does not retain a landing URL", () => {
  assert.equal(routeClickFromOrder({ landing_site: "/", note_attributes: [{ name: "rotator_rt_click", value: click }] }, "store.myshopify.com"), click);
});

test("rejects malformed tracking values", () => {
  assert.equal(routeClickFromOrder({ landing_site: "/?rt_click=null" }, "store.myshopify.com"), null);
});

test("normalizes Shopify's checkout creation time for guarded tokenless recovery", () => {
  assert.equal(orderCreatedAtFromWebhook({ created_at: "2026-09-22T14:06:42+00:00" }), "2026-09-22T14:06:42.000Z");
  assert.equal(orderCreatedAtFromWebhook({ created_at: "not a date" }), null);
  assert.equal(orderCreatedAtFromWebhook({}), null);
});
