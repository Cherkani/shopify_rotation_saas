import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyShopifyHmac } from "@/lib/shopify/hmac";

test("accepts a valid Shopify HMAC", () => {
  const body = JSON.stringify({ id: 123, financial_status: "paid" });
  const secret = "test-secret";
  const signature = createHmac("sha256", secret).update(body).digest("base64");
  assert.equal(verifyShopifyHmac(body, signature, secret), true);
});

test("rejects a modified Shopify HMAC", () => {
  const body = JSON.stringify({ id: 123 });
  const signature = createHmac("sha256", "test-secret").update(body).digest("base64");
  assert.equal(verifyShopifyHmac(`${body}x`, signature, "test-secret"), false);
  assert.equal(verifyShopifyHmac(body, "not-a-signature", "test-secret"), false);
});
