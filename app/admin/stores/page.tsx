import { AlertTriangle, KeyRound, Power, Store, Trash2 } from "lucide-react";
import { deleteStoreAction, toggleStoreAction } from "@/app/admin/actions";
import {
  CreateStoreDialog,
  EditStoreDialog,
} from "@/components/admin/store-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

export default async function StoresPage() {
  const supabase = createAdminSupabaseClient();
  const [{ data: stores }, { data: productListings }, { data: orders }] =
    await Promise.all([
      supabase
        .from("stores")
        .select("id, name, shop_domain, checkout_url, rotation_position, current_order_count, enabled, webhook_secret_hint")
        .order("rotation_position"),
      supabase.from("store_products").select("store_id"),
      supabase.from("orders_log").select("store_id"),
    ]);
  const productsByStore = new Map<string, number>();
  for (const listing of productListings ?? []) productsByStore.set(listing.store_id, (productsByStore.get(listing.store_id) ?? 0) + 1);
  const ordersByStore = new Map<string, number>();
  for (const order of orders ?? []) ordersByStore.set(order.store_id, (ordersByStore.get(order.store_id) ?? 0) + 1);

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Badge variant="secondary">
            <Store aria-hidden="true" />
            Store management
          </Badge>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            Destinations, without the clutter.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Each card is operational at a glance. Detailed configuration stays
            inside a focused edit panel.
          </p>
        </div>
        <CreateStoreDialog />
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        {(stores ?? []).map((store) => {
          const hasWebhookSecret = Boolean(store.webhook_secret_hint);
          return <Card key={store.id} className={!hasWebhookSecret ? "border-red-400/50 bg-red-950/10" : undefined}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Store
                      className="size-4 text-[#f2c96d]"
                      aria-hidden="true"
                    />
                    {store.name}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {store.shop_domain}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge variant={store.enabled ? "secondary" : "outline"}>{store.enabled ? "Active" : "Paused"}</Badge>
                  {!hasWebhookSecret ? <Badge variant="destructive"><AlertTriangle aria-hidden="true" /> Webhook key required</Badge> : <Badge variant="outline"><KeyRound aria-hidden="true" /> Key saved</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Store identity and webhook source</Badge>
              </div>
              {!hasWebhookSecret ? <div className="flex items-start gap-3 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-100"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-300" aria-hidden="true" /><p><span className="font-medium">This store cannot receive attributed routed traffic yet.</span><br /><span className="text-red-100/75">Add its Shopify webhook signing secret before using its product links.</span></p></div> : <p className="text-sm leading-6 text-muted-foreground">Products and product links are managed separately. This store remains the webhook identity used to verify and record orders.</p>}
              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
                <EditStoreDialog store={store} />
                <form action={toggleStoreAction}>
                  <input type="hidden" name="storeId" value={store.id} />
                  <input
                    type="hidden"
                    name="enabled"
                    value={String(!store.enabled)}
                  />
                  <Button type="submit" variant="outline" size="sm">
                    <Power aria-hidden="true" />
                    {store.enabled ? "Pause" : "Enable"}
                  </Button>
                </form>
                {!productsByStore.get(store.id) && !ordersByStore.get(store.id) ? <form action={deleteStoreAction}><input type="hidden" name="storeId" value={store.id} /><Button type="submit" variant="destructive" size="sm"><Trash2 aria-hidden="true" /> Delete store</Button></form> : <span className="self-center text-xs text-muted-foreground">Cannot delete: {productsByStore.get(store.id) ? `${productsByStore.get(store.id)} product listing${productsByStore.get(store.id) === 1 ? "" : "s"}` : `${ordersByStore.get(store.id)} order${ordersByStore.get(store.id) === 1 ? "" : "s"}`} assigned</span>}
              </div>
            </CardContent>
          </Card>;
        })}
      </section>
      {!(stores ?? []).length ? <EmptyState icon={Store} title="No stores yet" description="Add your first Shopify store to configure its webhook identity and product links." action={<CreateStoreDialog />} /> : null}
    </main>
  );
}
