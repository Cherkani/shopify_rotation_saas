"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { updateStoreProductTrackingAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type State = { ok: boolean; error?: string };

export function ShopifyProductIdForm({ storeProductId, initialValue }: { storeProductId: string; initialValue: string | null }) {
  const [state, action, pending] = useActionState(async (_previous: State, formData: FormData) => {
    try {
      await updateStoreProductTrackingAction(formData);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Could not save the Shopify Product ID" };
    }
  }, { ok: false });
  return <form action={action} className="mt-3 flex flex-col gap-2 sm:flex-row"><input type="hidden" name="storeProductId" value={storeProductId} /><Input name="shopifyProductId" inputMode="numeric" defaultValue={initialValue ?? ""} placeholder="Paste Shopify product ID" className="ops-input" /><Button type="submit" variant="outline" className="shrink-0" disabled={pending}><Save /> {pending ? "Saving…" : "Save ID"}</Button>{state.ok ? <p role="status" className="sm:col-span-2 text-xs text-emerald-300">Shopify Product ID saved.</p> : null}{state.error ? <p role="alert" className="sm:col-span-2 text-xs text-red-200">{state.error}</p> : null}</form>;
}
