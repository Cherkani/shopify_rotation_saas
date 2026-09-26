"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useId, useRef } from "react";
import { addProductGroupMemberAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Listing = { id: string; productName: string; storeProductName?: string; storeName: string };
type State = { ok: boolean; error?: string };

export function AddProductGroupListingDialog({ groupId, listings }: { groupId: string; listings: Listing[] }) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  const [state, action, pending] = useActionState(async (_previous: State, data: FormData) => { try { await addProductGroupMemberAction(data); return { ok: true }; } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Could not add product listing" }; } }, { ok: false });
  useEffect(() => { if (state.ok) ref.current?.close(); }, [state.ok]);
  return <><Button type="button" variant="outline" size="sm" onClick={() => ref.current?.showModal()}><Plus /> Assign remaining product</Button><dialog ref={ref} className="ops-dialog w-[min(94vw,34rem)] border border-white/15 bg-[#201d18] p-0 text-[#f5f0e8] shadow-2xl backdrop:bg-black/70"><form action={action}><div className="border-b border-white/10 px-5 py-5"><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#f2c96d]">Product group</p><h2 className="mt-1 font-serif text-2xl">Assign remaining product</h2><p className="mt-2 text-sm text-[#aaa196]">Only product listings not assigned to any group are available. The existing sales step is applied automatically.</p></div><div className="grid gap-4 p-5">{listings.length ? <><input type="hidden" name="groupId" value={groupId} /><input type="hidden" name="stepCount" value="1" /><div><Label htmlFor={`${id}-listing`}>Available product listing</Label><select id={`${id}-listing`} name="storeProductId" required className="ops-select mt-2"><option value="">Choose a product listing</option>{listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.productName}{listing.storeProductName ? ` · ${listing.storeProductName}` : ""} · {listing.storeName}</option>)}</select></div></> : <p className="rounded-lg border border-dashed border-white/15 px-4 py-8 text-center text-sm text-muted-foreground">Every available product listing is already assigned to a product group.</p>}{state.error ? <p role="alert" className="rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-100">{state.error}</p> : null}</div><div className="flex justify-end gap-3 border-t border-white/10 px-5 py-4"><Button type="button" variant="ghost" onClick={() => ref.current?.close()}>{listings.length ? "Cancel" : "Close"}</Button>{listings.length ? <Button type="submit" disabled={pending} className="ops-gold-button">{pending ? "Assigning…" : "Assign product"}</Button> : null}</div></form></dialog></>;
}
