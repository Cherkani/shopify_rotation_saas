import { Package, Store } from "lucide-react";
import { CreateProductDialog } from "@/components/admin/product-dialogs";
import { ProductsByStore } from "@/components/admin/products-by-store";
import { Badge } from "@/components/ui/badge";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const db = createAdminSupabaseClient();
  const [{ data: products }, { data: listings }, { data: stores }] = await Promise.all([
    db.from("products").select("id, name, enabled").order("name"),
    db.from("store_products").select("id, product_id, store_id, product_url, shopify_product_id, enabled").order("created_at"),
    db.from("stores").select("id, name, shop_domain, enabled, webhook_secret_hint").order("rotation_position"),
  ]);
  return <main className="space-y-6 p-4 sm:p-6">
    <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><Badge variant="secondary"><Package /> Products</Badge><h1 className="mt-3 text-balance text-2xl font-semibold sm:text-3xl">Products by store.</h1><p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">Each store keeps its own products and direct links. Empty stores stay visible so you can add their first product at any time.</p></div><CreateProductDialog stores={stores ?? []} /></section>
    <ProductsByStore stores={stores ?? []} listings={listings ?? []} products={products ?? []} />
    {!stores?.length ? <EmptyState icon={Store} title="No stores yet" description="Create a store first, then add its products and direct links." /> : null}
  </main>;
}
