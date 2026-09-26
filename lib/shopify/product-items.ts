import type { ProductItem } from "@/lib/reporting";

// Whitelist product fields only. Never persist customer details or line properties.
export function extractProductItems(value: unknown): ProductItem[] | null {
  if (!Array.isArray(value)) return null;
  return value.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid order line item");
    const item = raw as Record<string, unknown>;
    const quantity = Number(item.quantity);
    const price = Number(item.price);
    if (!item.id || !Number.isSafeInteger(quantity) || quantity < 0 || !Number.isFinite(price) || price < 0) throw new Error("Invalid order line item values");
    const discount = Array.isArray(item.discount_allocations)
      ? item.discount_allocations.reduce((sum: number, allocation: { amount?: unknown }) => sum + Number(allocation.amount ?? 0), 0)
      : Number(item.total_discount ?? 0);
    if (!Number.isFinite(discount) || discount < 0) throw new Error("Invalid line discount");
    return { id: String(item.id), productId: item.product_id ? String(item.product_id) : null, title: String(item.title ?? item.name ?? "Untitled product").slice(0, 300), sku: String(item.sku ?? "").slice(0, 150), quantity, gross: Math.round(price * quantity * 100) / 100, discount };
  });
}
