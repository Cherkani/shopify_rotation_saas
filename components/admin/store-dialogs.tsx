"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, Pencil, Plus, Save, X } from "lucide-react";
import { createStoreAction, updateStoreAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { ActionError, AdminModal } from "@/components/admin/admin-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Store } from "@/lib/supabase/types";

const SHOPIFY_WEBHOOK_URL = "https://shopify-store-rotation.vercel.app/api/webhooks/shopify";

type StoreDialogProps = { store: Store };
type FormState = { ok: boolean; error?: string };

function DialogFrame({
  children,
  dialogRef,
}: {
  children: React.ReactNode;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
}) {
  return (
    <AdminModal dialogRef={dialogRef}>
      {children}
    </AdminModal>
  );
}

function StoreFields({
  store,
}: {
  store?: Store;
}) {
  const id = store?.id ?? "new";
  const shopHandle = store?.shop_domain.replace(/\.myshopify\.com$/i, "") ?? "";
  const webhookAdminUrl = store ? `https://admin.shopify.com/store/${shopHandle}/settings/notifications/webhooks` : null;
  const hasSavedSecret = Boolean(store?.webhook_secret_hint);
  return (
    <div className="grid gap-4">
      <div>
        <Label htmlFor={`${id}-name`}>Store name</Label>
        <Input id={`${id}-name`} name="storeName" required defaultValue={store?.name ?? ""} placeholder="Main US store" className="ops-input mt-2" />
        <p className="mt-2 text-xs text-[#80786e]">This is the name shown in your admin dashboard. It can be different from the Shopify link.</p>
      </div>
      <div>
        <Label htmlFor={`${id}-handle`}>Shopify store link</Label>
        <div className="mt-2 flex items-stretch">
          <Input id={`${id}-handle`} name="shopHandle" required defaultValue={shopHandle} placeholder="kxwkxm-99" className="ops-input rounded-r-none" />
          <span className="inline-flex items-center rounded-r-md border border-l-0 border-white/15 bg-white/[.04] px-3 text-sm text-[#aaa196]">.myshopify.com</span>
        </div>
        <p className="mt-2 text-xs text-[#80786e]">Used for Shopify webhooks and store identification: <span className="font-mono text-[#f5f0e8]">https://{shopHandle || "your-store"}.myshopify.com</span>.</p>
      </div>
      <div className="sm:col-span-2">
        <Field
          id={`${id}-webhook`}
          label={store ? "Replace Shopify webhook secret" : "Shopify webhook secret (optional for now)"}
          name="webhookSecret"
          type="password"
          required={false}
          placeholder={store?.webhook_secret_hint ? `Saved secret ending in ····${store.webhook_secret_hint}` : "Paste the Shopify webhook signing secret"}
        />
        {store?.webhook_secret_hint ? <p className="mt-2 text-xs text-[#aaa196]">Saved securely. Visible hint: <span className="font-mono text-[#f5f0e8]">····{store.webhook_secret_hint}</span>. Leave blank to keep it unchanged.</p> : null}
        {webhookAdminUrl ? <div className={`mt-3 rounded-lg border p-3 ${hasSavedSecret ? "border-white/10 bg-white/[.03]" : "border-red-400/30 bg-red-400/10"}`}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-start gap-2"><KeyRound className={`mt-0.5 size-4 shrink-0 ${hasSavedSecret ? "text-[#f2c96d]" : "text-red-300"}`} /><p className="text-xs leading-5 text-[#aaa196]">{hasSavedSecret ? "Need to replace the saved key? Open Shopify webhooks." : "This store is blocked until its Shopify webhook secret is added."}</p></div><Button asChild type="button" size="sm" variant={hasSavedSecret ? "outline" : "destructive"}><a href={webhookAdminUrl} target="_blank" rel="noreferrer"><ExternalLink />Open Shopify webhooks</a></Button></div>{!hasSavedSecret ? <p className="mt-2 text-xs leading-5 text-red-100/75">In Shopify, create the webhook using the setup below, then paste the signing secret above.</p> : null}</div> : null}
        <WebhookSetupGuide />
      </div>
    </div>
  );
}

function WebhookSetupGuide() {
  const [copied, setCopied] = useState(false);
  async function copyUrl() {
    await navigator.clipboard.writeText(SHOPIFY_WEBHOOK_URL);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return <div className="rounded-lg border border-[#f2c96d]/20 bg-[#f2c96d]/[.05] p-4"><div className="flex items-start gap-3"><KeyRound className="mt-0.5 size-4 shrink-0 text-[#f2c96d]" /><div className="min-w-0 flex-1"><p className="text-sm font-medium text-[#f5f0e8]">Shopify webhook setup</p><p className="mt-1 text-xs leading-5 text-[#aaa196]">In Shopify Admin → Settings → Notifications → Webhooks, create both webhooks below:</p><dl className="mt-3 grid gap-2 text-xs sm:grid-cols-[auto_1fr]"><dt className="text-[#80786e]">Events</dt><dd className="font-medium text-[#f5f0e8]">Order creation and Order payment</dd><dt className="text-[#80786e]">Format</dt><dd className="font-medium text-[#f5f0e8]">JSON</dd><dt className="text-[#80786e]">URL</dt><dd className="flex min-w-0 items-center gap-2"><code className="min-w-0 truncate text-[#f2c96d]">{SHOPIFY_WEBHOOK_URL}</code><Button type="button" variant="ghost" size="icon-xs" aria-label="Copy webhook URL" title="Copy webhook URL" onClick={copyUrl}>{copied ? <Check className="text-emerald-300" /> : <Copy />}</Button></dd></dl><p className="mt-3 text-xs leading-5 text-[#aaa196]">Use the same signing secret for both, then paste it into the field above.</p></div></div></div>;
}

export function CreateStoreDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(async (_previous: FormState, formData: FormData) => {
    try { await createStoreAction(formData); return { ok: true }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not create store" }; }
  }, { ok: false });
  useEffect(() => { if (state.ok) dialogRef.current?.close(); }, [state.ok]);
  return (
    <>
      <Button
        className="ops-gold-button"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Plus aria-hidden="true" />
        Add store
      </Button>
      <DialogFrame dialogRef={dialogRef}>
        <div className="border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#f2c96d]">
                New destination
              </p>
              <h2 id="create-store-title" className="mt-1 font-serif text-2xl">
                Add a Shopify store
              </h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
            >
              <X />
            </Button>
          </div>
        </div>
        <form
          action={formAction}
          className="space-y-6 p-5 sm:p-6"
          aria-labelledby="create-store-title"
        >
          <StoreFields />
          <ActionError error={state.error} />
          <p className="text-xs leading-5 text-[#aaa196]">You can save the store first and add the Shopify webhook secret from the edit panel. Any secret is encrypted before storage and never returned to this interface.</p>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending} className="ops-gold-button">
              <Plus />
              {pending ? "Creating…" : "Create store"}
            </Button>
          </div>
        </form>
      </DialogFrame>
    </>
  );
}

export function EditStoreDialog({ store }: StoreDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(async (_previous: FormState, formData: FormData) => {
    try { await updateStoreAction(formData); return { ok: true }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not update store" }; }
  }, { ok: false });
  useEffect(() => { if (state.ok) dialogRef.current?.close(); }, [state.ok]);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Edit ${store.name}`}
        className={!store.webhook_secret_hint ? "border-red-300/60 text-red-200 hover:bg-red-400/10 hover:text-red-100" : undefined}
        onClick={() => dialogRef.current?.showModal()}
      >
        <Pencil aria-hidden="true" />
      </Button>
      <DialogFrame dialogRef={dialogRef}>
        <div className="border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-[#f2c96d]">
                Store configuration
              </p>
              <h2
                id={`${store.id}-dialog-title`}
                className="mt-1 font-serif text-2xl"
              >
                {store.name}
              </h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={() => dialogRef.current?.close()}
            >
              <X />
            </Button>
          </div>
        </div>
        <form
          action={formAction}
          className="space-y-6 p-5 sm:p-6"
          aria-labelledby={`${store.id}-dialog-title`}
        >
          <input type="hidden" name="storeId" value={store.id} />
          <StoreFields store={store} />
          <ActionError error={state.error} />
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending} className="ops-gold-button">
              <Save />
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogFrame>
    </>
  );
}

function Field({
  id,
  label,
  name,
  value,
  type = "text",
  required = true,
  min,
  placeholder,
}: {
  id: string;
  label: string;
  name: string;
  value?: string | number;
  type?: string;
  required?: boolean;
  min?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        required={required}
        type={type}
        min={min}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        className="ops-input mt-2"
      />
    </div>
  );
}
