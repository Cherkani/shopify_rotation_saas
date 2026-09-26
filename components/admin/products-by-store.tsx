"use client";

import { useMemo, useState } from "react";
import {
  ExternalLink,
  Filter,
  PackagePlus,
  Power,
  Search,
  Store,
  Trash2,
} from "lucide-react";
import {
  CreateProductDialog,
  EditProductListingDialog,
} from "@/components/admin/product-dialogs";
import {
  toggleStoreProductAction,
  deleteStoreProductAction,
} from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/admin/empty-state";
import { ShopifyProductIdForm } from "@/components/admin/shopify-product-id-form";

type StoreRow = {
  id: string;
  name: string;
  shop_domain: string;
  enabled: boolean;
  webhook_secret_hint: string | null;
};
type Product = { id: string; name: string; enabled: boolean };
type Listing = {
  id: string;
  product_id: string;
  store_id: string;
  product_url: string;
  shopify_product_id: string | null;
  enabled: boolean;
};

export function ProductsByStore({
  stores,
  listings,
  products,
}: {
  stores: StoreRow[];
  listings: Listing[];
  products: Product[];
}) {
  const [query, setQuery] = useState("");
  const [contentFilter, setContentFilter] = useState("all");
  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const listingsByStore = useMemo(() => {
    const map = new Map<string, Listing[]>();
    for (const listing of listings)
      map.set(listing.store_id, [
        ...(map.get(listing.store_id) ?? []),
        listing,
      ]);
    return map;
  }, [listings]);
  const visibleStores = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return stores.filter((store) => {
      const storeListings = listingsByStore.get(store.id) ?? [];
      const matchesSearch =
        !normalized ||
        [
          store.name,
          store.shop_domain,
          ...storeListings.flatMap((listing) => [
            productMap.get(listing.product_id)?.name ?? "",
          ]),
        ].some((value) => value.toLowerCase().includes(normalized));
      const matchesContent =
        contentFilter === "all" ||
        (contentFilter === "empty"
          ? storeListings.length === 0
          : storeListings.length > 0);
      return matchesSearch && matchesContent;
    });
  }, [contentFilter, listingsByStore, productMap, query, stores]);

  return (
    <>
      <section className="rounded-xl border border-white/10 bg-black/10 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <label htmlFor="product-search" className="text-sm font-medium">
              Find a store or product
            </label>
            <div className="relative mt-2 max-w-xl">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="product-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search store, domain, or product…"
                className="ops-input pl-9"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="product-content-filter"
              className="text-sm font-medium"
            >
              Products
            </label>
            <select
              id="product-content-filter"
              value={contentFilter}
              onChange={(event) => setContentFilter(event.target.value)}
              className="ops-select mt-2"
            >
              <option value="all">All stores</option>
              <option value="with-products">Has products</option>
              <option value="empty">Empty stores</option>
            </select>
          </div>
        </div>
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Filter className="size-4" /> Showing {visibleStores.length} of{" "}
          {stores.length} stores · {listings.length} products assigned
        </p>
      </section>
      <section className="grid gap-5 xl:grid-cols-2">
        {visibleStores.map((store) => {
          const storeListings = listingsByStore.get(store.id) ?? [];
          const shopHandle = store.shop_domain.replace(/\.myshopify\.com$/i, "");
          const shopifyProductsUrl = `https://admin.shopify.com/store/${shopHandle}/products`;
          return (
            <Card key={store.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Store className="size-4 text-[#f2c96d]" />
                      {store.name}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {store.shop_domain} · {storeListings.length} product
                      {storeListings.length === 1 ? "" : "s"}
                    </CardDescription>
                    <a
                      href={shopifyProductsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#f2c96d] underline underline-offset-4 hover:text-[#ffe1a0]"
                    >
                      Open Shopify products <ExternalLink className="size-3" />
                    </a>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {store.webhook_secret_hint ? <CreateProductDialog stores={stores} defaultStoreId={store.id} label="Add product" /> : null}
                    <Badge variant={store.enabled ? "secondary" : "outline"}>
                      {store.enabled ? "Active" : "Paused"}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {storeListings.map((listing) => {
                    const product = productMap.get(listing.product_id);
                    const productName = product?.name ?? "";
                    const shopifyProductSearchUrl = `https://admin.shopify.com/store/${shopHandle}/products?${new URLSearchParams({ query: productName }).toString()}`;
                    return (
                      <div
                        key={listing.id}
                        className="rounded-lg border border-white/10 bg-black/10 p-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {product?.name ?? "Unknown product"}
                            </p>
                            <a
                              href={listing.product_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 flex items-center gap-1 truncate text-xs text-[#f2c96d] underline underline-offset-4"
                            >
                              <span className="truncate">
                                {listing.product_url}
                              </span>
                              <ExternalLink className="size-3 shrink-0" />
                            </a>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge
                              variant={
                                listing.enabled ? "secondary" : "outline"
                              }
                            >
                              {listing.enabled ? "Enabled" : "Disabled"}
                            </Badge>
                            {product ? (
                              <EditProductListingDialog
                                product={product}
                                listing={listing}
                                iconOnly
                              />
                            ) : null}
                            <form action={deleteStoreProductAction}>
                              <input type="hidden" name="storeProductId" value={listing.id} />
                              <Button type="submit" variant="ghost" size="icon" aria-label={`Delete ${product?.name ?? "product"} from ${store.name}`}>
                                <Trash2 className="size-4 text-red-300" />
                              </Button>
                            </form>
                          </div>
                        </div>
                        <div className="mt-4 border-t border-white/10 pt-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-medium text-[#f5f0e8]">Shopify product ID</p><Badge variant={listing.shopify_product_id ? "secondary" : "destructive"}>{listing.shopify_product_id ? "Saved" : "ID needed"}</Badge></div>
                              <p className="mt-1 text-xs text-muted-foreground">{listing.shopify_product_id ? "Saved for strict sale attribution." : "We need this before this Shopify listing can safely advance sales rotation."}</p>
                            </div>
                            <a href={shopifyProductSearchUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-[#f2c96d] underline underline-offset-4 hover:text-[#ffe1a0]">
                              Find “{productName || "product"}” in Shopify <ExternalLink className="size-3" />
                            </a>
                          </div>
                          <ShopifyProductIdForm storeProductId={listing.id} initialValue={listing.shopify_product_id} />
                        </div>
                        <form
                          action={toggleStoreProductAction}
                          className="mt-3 border-t border-white/10 pt-2"
                        >
                          <input
                            type="hidden"
                            name="storeProductId"
                            value={listing.id}
                          />
                          <input
                            type="hidden"
                            name="enabled"
                            value={String(!listing.enabled)}
                          />
                          <Button type="submit" variant="ghost" size="sm">
                            <Power />{" "}
                            {listing.enabled
                              ? "Disable product"
                              : "Enable product"}
                          </Button>
                        </form>
                      </div>
                    );
                  })}
                  {!storeListings.length ? (
                    <div className="rounded-lg border border-dashed border-white/15 px-4 py-8 text-center">
                      <PackagePlus className="mx-auto size-5 text-[#f2c96d]" />
                      <p className="mt-3 text-sm font-medium">
                        No products assigned
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {store.webhook_secret_hint ? "Add this store’s first product and direct link." : "Configure this store’s Shopify webhook before adding products."}
                      </p>
                      {store.webhook_secret_hint ? <div className="mt-4">
                        <CreateProductDialog
                          stores={stores}
                          defaultStoreId={store.id}
                          label="Add product to this store"
                        />
                      </div> : null}
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>
      {!visibleStores.length ? (
        <EmptyState icon={Search} title="No stores found" description="Try clearing your search or choosing a different product filter." />
      ) : null}
    </>
  );
}
