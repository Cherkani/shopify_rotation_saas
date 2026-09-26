"use client";

import { Pencil, Plus, X } from "lucide-react";
import {
  createProductAction,
  updateProductListingAction,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminModal } from "@/components/admin/admin-dialog";
import { useActionState, useEffect, useId, useRef } from "react";

type Store = { id: string; name: string; shop_domain?: string; webhook_secret_hint?: string | null };

type FormState = { ok: boolean; error?: string };
type FormAction = (formData: FormData) => void;

export function CreateProductForm({
  stores,
  action = createProductAction,
  error,
  pending = false,
  defaultStoreId,
}: {
  stores: Store[];
  action?: FormAction;
  error?: string;
  pending?: boolean;
  defaultStoreId?: string;
}) {
  const formId = useId();
  const configuredStores = stores.filter((store) => Boolean(store.webhook_secret_hint));
  return (
    <form
      action={action}
      className="grid gap-4 rounded-xl border border-white/10 bg-black/10 p-5 sm:grid-cols-2"
    >
      <div>
        <Label htmlFor={`${formId}-product-name`}>Product name</Label>
        <Input
          id={`${formId}-product-name`}
          name="productName"
          required
          placeholder="Vitamin C Serum"
          className="ops-input mt-2"
        />
      </div>
      <div>
        <Label htmlFor={`${formId}-store`}>Store</Label>
        <select
          id={`${formId}-store`}
          name="storeId"
          required
          defaultValue={defaultStoreId ?? ""}
          className="ops-select mt-2"
        >
          <option value="">Choose a store</option>
          {configuredStores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
              {store.shop_domain ? ` · ${store.shop_domain}` : ""}
            </option>
          ))}
        </select>
        {!configuredStores.length ? <p className="mt-2 text-xs text-red-200">Configure a store’s Shopify webhook before adding products.</p> : null}
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={`${formId}-url`}>Direct HTTPS product link</Label>
        <Input
          id={`${formId}-url`}
          name="productUrl"
          required
          type="url"
          placeholder="https://shop.example.com/products/vitamin-c"
          className="ops-input mt-2"
        />
        <p className="mt-2 text-xs text-[#80786e]">
          Any HTTPS domain is accepted. It does not need to be Shopify.
        </p>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-100 sm:col-span-2"
        >
          {error}
        </p>
      ) : null}
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={pending} className="ops-gold-button">
          <Plus /> {pending ? "Creating…" : "Create product"}
        </Button>
      </div>
    </form>
  );
}

export function CreateProductDialog({
  stores,
  defaultStoreId,
  label = "Add product",
}: {
  stores: Store[];
  defaultStoreId?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const hasConfiguredStore = stores.some((store) => Boolean(store.webhook_secret_hint));
  const [state, formAction, pending] = useActionState(
    async (_previous: FormState, formData: FormData) => {
      try {
        await createProductAction(formData);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error ? error.message : "Could not create product",
        };
      }
    },
    { ok: false },
  );
  useEffect(() => {
    if (state.ok) ref.current?.close();
  }, [state.ok]);
  return (
    <>
      <Button
        type="button"
        className="ops-gold-button"
        disabled={!hasConfiguredStore}
        title={hasConfiguredStore ? undefined : "Configure a store’s Shopify webhook before adding products"}
        onClick={() => ref.current?.showModal()}
      >
        <Plus /> {label}
      </Button>
      <AdminModal dialogRef={ref} className="w-[min(94vw,48rem)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#f2c96d]">
              Product catalog
            </p>
            <h2 className="mt-1 font-serif text-2xl">Add product</h2>
            <p className="mt-2 text-sm text-[#aaa196]">
              Connect a product name and direct link to any store.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={() => ref.current?.close()}
          >
            <X />
          </Button>
        </div>
        <div className="p-5 sm:p-6">
          <CreateProductForm
            stores={stores}
            action={formAction}
            error={state.error}
            pending={pending}
            defaultStoreId={defaultStoreId}
          />
        </div>
      </AdminModal>
    </>
  );
}

type EditableListing = {
  id: string;
  product_id: string;
  product_url: string;
  shopify_product_id: string | null;
};
type EditableProduct = { id: string; name: string };

export function EditProductListingDialog({
  product,
  listing,
  iconOnly = false,
}: {
  product: EditableProduct;
  listing: EditableListing;
  iconOnly?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const [state, formAction, pending] = useActionState(
    async (_previous: FormState, formData: FormData) => {
      try {
        await updateProductListingAction(formData);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error ? error.message : "Could not update product",
        };
      }
    },
    { ok: false },
  );
  useEffect(() => {
    if (state.ok) ref.current?.close();
  }, [state.ok]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={iconOnly ? "icon" : "sm"}
        aria-label={`Edit ${product.name}`}
        onClick={() => ref.current?.showModal()}
      >
        <Pencil />{iconOnly ? null : " Edit"}
      </Button>
      <AdminModal dialogRef={ref} className="w-[min(94vw,42rem)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#f2c96d]">
              Product catalog
            </p>
            <h2 className="mt-1 font-serif text-2xl">Edit product</h2>
            <p className="mt-2 text-sm text-[#aaa196]">Update the shared product name, this store&apos;s direct link, and its Shopify verification ID.</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={() => ref.current?.close()}
          >
            <X />
          </Button>
        </div>
        <form action={formAction} className="grid gap-4 p-5 sm:p-6">
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="storeProductId" value={listing.id} />
          <div>
            <Label htmlFor={`${formId}-product-name`}>Product name</Label>
            <Input
              id={`${formId}-product-name`}
              name="productName"
              defaultValue={product.name}
              required
              className="ops-input mt-2"
            />
            <p className="mt-2 text-xs text-[#80786e]">This name is shared everywhere this product is assigned.</p>
          </div>
          <div>
            <Label htmlFor={`${formId}-url`}>Direct HTTPS product link</Label>
            <Input
              id={`${formId}-url`}
              name="productUrl"
              type="url"
              defaultValue={listing.product_url}
              required
              className="ops-input mt-2"
            />
          </div>
          <div>
            <Label htmlFor={`${formId}-shopify-id`}>
              Shopify product ID{" "}
              <span className="text-muted-foreground">(recommended)</span>
            </Label>
            <Input
              id={`${formId}-shopify-id`}
              name="shopifyProductId"
              inputMode="numeric"
              defaultValue={listing.shopify_product_id ?? ""}
              className="ops-input mt-2"
            />
          </div>
          {state.error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-100"
            >
              {state.error}
            </p>
          ) : null}
          <div className="flex justify-end gap-3 border-t border-white/10 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => ref.current?.close()}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending}
              className="ops-gold-button"
            >
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </AdminModal>
    </>
  );
}
