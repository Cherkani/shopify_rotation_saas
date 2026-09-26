import { AlertTriangle, ExternalLink, Link2, Package, Trash2 } from "lucide-react";
import { removeProductGroupMemberAction, toggleProductGroupAction } from "@/app/admin/actions";
import { RoutingProfileDialog } from "@/components/admin/routing-profile-dialog";
import { AddProductGroupListingDialog } from "@/components/admin/add-product-group-listing-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

export default async function RoutingPage() {
  const db = createAdminSupabaseClient();
  const [{ data: groups }, { data: members }, { data: listings }, { data: products }, { data: stores }, { data: states }] = await Promise.all([
    db.from("product_groups").select("id, name, slug, step_mode, equal_step, enabled, created_at").order("created_at", { ascending: false }),
    db.from("product_group_members").select("group_id, store_product_id, step_count, sequence_position, enabled"),
    db.from("store_products").select("id, product_id, store_id, product_url, shopify_product_id, enabled"),
    db.from("products").select("id, name, enabled"),
    db.from("stores").select("id, name, enabled, webhook_secret_hint").order("rotation_position"),
    db.from("product_group_state").select("group_id, active_member_store_product_id, remaining_steps, rotation_round"),
  ]);
  const storeMap = new Map((stores ?? []).map((store) => [store.id, store]));
  const productMap = new Map((products ?? []).map((product) => [product.id, product]));
  const listingMap = new Map((listings ?? []).map((listing) => [listing.id, listing]));
  const assignedListingIds = new Set((members ?? []).map((member) => member.store_product_id));
  const dialogListings = (listings ?? [])
    .filter((listing) => listing.enabled && Boolean(listing.shopify_product_id?.trim()) && productMap.get(listing.product_id)?.enabled)
    .map((listing) => ({
      id: listing.id,
      storeName: storeMap.get(listing.store_id)?.name ?? "Unknown store",
      productName: productMap.get(listing.product_id)?.name ?? "Unknown product",
    }));
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Badge variant="secondary"><Package /> Product grouping</Badge>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Product groups.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Create a group from product listings across your stores, then rotate its direct product links using verified sales.</p>
        </div>
        <RoutingProfileDialog listings={dialogListings} />
      </section>
      <section className="grid gap-4 sm:grid-cols-3">
        <Metric label="Groups" value={String(groups?.length ?? 0)} note="Product campaign links" />
        <Metric label="Listings" value={String(listings?.length ?? 0)} note="Store product links" />
        <Metric label="Available" value={String(dialogListings.length)} note="Ready for routing" />
      </section>
      <section className="grid gap-5 xl:grid-cols-2">
        {(groups ?? []).map((group) => {
          const groupMembers = (members ?? []).filter((member) => member.group_id === group.id).sort((a, b) => a.sequence_position - b.sequence_position);
          const availableListings = dialogListings.filter((listing) => !assignedListingIds.has(listing.id));
          const editableListings = dialogListings.filter((listing) => !assignedListingIds.has(listing.id) || groupMembers.some((member) => member.store_product_id === listing.id));
          const state = (states ?? []).find((item) => item.group_id === group.id);
          const missing = groupMembers.filter((member) => {
            const listing = listingMap.get(member.store_product_id);
            const store = listing ? storeMap.get(listing.store_id) : undefined;
            return !listing?.enabled || !store?.enabled || !store.webhook_secret_hint;
          }).length;
          const ready = missing === 0 && groupMembers.length > 0;
          const groupLink = `${origin}/r/${group.slug}`;
          return (
            <Card key={group.id} className={!ready ? "border-red-400/40" : undefined}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      {group.name}
                      {!group.enabled ? <Badge variant="outline">Paused</Badge> : null}
                      {!ready ? <Badge variant="destructive"><AlertTriangle /> Blocked</Badge> : null}
                    </CardTitle>
                    <CardDescription className="mt-2 flex flex-wrap items-center gap-2">
                      <Link2 className="size-3" />
                      <a href={groupLink} target="_blank" rel="noreferrer" className="text-[#f2c96d] underline underline-offset-4">{groupLink}</a>
                      <span>·</span>
                      <span>{group.step_mode === "equal_step" ? `${group.equal_step} verified sales base · progressive rounds` : "custom verified sales · progressive rounds"}</span>
                      {state?.rotation_round && state.rotation_round > 1 ? <><span>·</span><span>Round {state.rotation_round}</span></> : null}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2"><RoutingProfileDialog listings={editableListings} editGroup={{ id: group.id, name: group.name, slug: group.slug, stepMode: group.step_mode, equalStep: group.equal_step, selectedIds: groupMembers.map((member) => member.store_product_id), customSteps: Object.fromEntries(groupMembers.map((member) => [member.store_product_id, member.step_count])) }} /><form action={toggleProductGroupAction}><input type="hidden" name="groupId" value={group.id} /><input type="hidden" name="enabled" value={String(!group.enabled)} /><Button type="submit" variant="outline" size="sm" disabled={!ready}>{group.enabled ? "Pause" : "Enable"}</Button></form></div>
                </div>
                {!ready ? <p className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs text-red-100">{missing ? `${missing} listing${missing === 1 ? " is" : "s are"} unavailable or missing a store webhook key.` : "Add at least one product listing before enabling this group."}</p> : null}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {groupMembers.map((member) => {
                    const listing = listingMap.get(member.store_product_id);
                    const store = listing ? storeMap.get(listing.store_id) : undefined;
                    const product = listing ? productMap.get(listing.product_id) : undefined;
                    const current = state?.active_member_store_product_id === member.store_product_id;
                    return (
                      <div key={member.store_product_id} className={`flex items-center gap-3 border px-3 py-3 ${current ? "border-emerald-300/50 bg-emerald-300/5" : "border-white/10"}`}>
                        <span className="w-6 text-center text-xs text-muted-foreground">{member.sequence_position}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{product?.name ?? "Unknown product"}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{store?.name ?? "Unknown store"} · {listing?.product_url ?? "No URL"}</p>
                          <p className="mt-1 text-xs text-[#aaa196]">{current ? `Receiving traffic · ${state?.remaining_steps ?? 0} sales left` : `Sales step ${(group.step_mode === "equal_step" ? group.equal_step : member.step_count) * (state?.rotation_round ?? 1)}`}</p>
                        </div>
                        <form action={removeProductGroupMemberAction}>
                          <input type="hidden" name="groupId" value={group.id} />
                          <input type="hidden" name="storeProductId" value={member.store_product_id} />
                          <Button type="submit" variant="ghost" size="icon" aria-label="Remove product listing"><Trash2 className="size-4 text-red-300" /></Button>
                        </form>
                      </div>
                    );
                  })}
                  {!groupMembers.length ? <p className="border border-dashed border-white/15 p-8 text-center text-sm text-muted-foreground">No product listings in this group.</p> : null}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><a href={groupLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-[#f5f0e8]"><ExternalLink className="size-4" />Open product route</a><AddProductGroupListingDialog groupId={group.id} listings={availableListings} /></div>
              </CardContent>
            </Card>
          );
        })}
      </section>
      {!(groups ?? []).length ? <EmptyState icon={Package} title="No product groups yet" description="Create a product group after adding at least one product listing to a store." /> : null}
    </main>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div><p className="text-xs uppercase tracking-[.12em] text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p><p className="text-xs text-muted-foreground">{note}</p></div>; }
