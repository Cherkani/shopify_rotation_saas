"use client";

import { utcTimestamp } from "@/lib/display";

import { useMemo, useState } from "react";
import { ArrowDownUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/reporting";

type Store = { id: string; name: string };
type Group = { id: string; name: string; slug: string };
type Order = { id: string; store_id: string; product_group_id: string | null; shopify_order_id: string; total_price: number | null; currency: string | null; attribution_status: string | null; created_at: string };

const PAGE_SIZE = 20;

export function OrdersLedger({ orders, stores, groups }: { orders: Order[]; stores: Store[]; groups: Group[] }) {
  const [groupId, setGroupId] = useState("all");
  const [storeId, setStoreId] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const storeNames = useMemo(() => new Map(stores.map((store) => [store.id, store.name])), [stores]);
  const groupNames = useMemo(() => new Map(groups.map((group) => [group.id, group.name])), [groups]);
  const filteredOrders = useMemo(() => orders.filter((order) => {
    const matchesGroup = groupId === "all" || order.product_group_id === groupId;
    const matchesStore = storeId === "all" || order.store_id === storeId;
    const searchable = `${order.shopify_order_id} ${storeNames.get(order.store_id) ?? ""} ${groupNames.get(order.product_group_id ?? "") ?? ""}`.toLowerCase();
    return matchesGroup && matchesStore && searchable.includes(search.trim().toLowerCase());
  }), [groupId, groupNames, orders, search, storeId, storeNames]);
  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageOrders = filteredOrders.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const from = filteredOrders.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(currentPage * PAGE_SIZE, filteredOrders.length);

  return <section>
    <div className="flex flex-col gap-4 border-y border-white/10 bg-white/[0.015] px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="order-group-filter" className="text-xs font-medium uppercase tracking-[.14em] text-muted-foreground">Product group</label><select id="order-group-filter" value={groupId} onChange={(event) => { setGroupId(event.target.value); setPage(1); }} className="ops-select mt-2 w-full"><option value="all">All groups</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div>
        <div><label htmlFor="order-store-filter" className="text-xs font-medium uppercase tracking-[.14em] text-muted-foreground">Store</label><select id="order-store-filter" value={storeId} onChange={(event) => { setStoreId(event.target.value); setPage(1); }} className="ops-select mt-2 w-full"><option value="all">All stores</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></div>
      </div>
      <div className="relative w-full lg:max-w-xs"><label htmlFor="order-search" className="sr-only">Search orders</label><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input id="order-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search order, store, or group" className="ops-input w-full pl-9" /></div>
    </div>
    <div className="flex items-center justify-between gap-3 px-5 py-4"><div><h2 className="font-semibold text-[#f5f0e8]">Verified order ledger</h2><p className="mt-1 text-xs text-muted-foreground">Original Shopify checkout amounts and currencies. Received times are UTC.</p></div><Badge variant="outline">{filteredOrders.length} {filteredOrders.length === 1 ? "order" : "orders"}</Badge></div>
    {filteredOrders.length ? <><Table><TableHeader><TableRow><TableHead className="pl-5">Order</TableHead><TableHead>Store</TableHead><TableHead>Product group</TableHead><TableHead>Original amount</TableHead><TableHead>Currency</TableHead><TableHead>Status</TableHead><TableHead className="pr-5">Received</TableHead></TableRow></TableHeader><TableBody>{pageOrders.map((order) => <TableRow key={order.id}><TableCell className="pl-5 font-medium tabular-nums">{order.shopify_order_id}</TableCell><TableCell>{storeNames.get(order.store_id) ?? "Unknown store"}</TableCell><TableCell>{order.product_group_id ? groupNames.get(order.product_group_id) ?? "Deleted group" : <span className="text-muted-foreground">Direct sale</span>}</TableCell><TableCell className="font-medium tabular-nums">{money(Number(order.total_price ?? 0), order.currency ?? "USD")}</TableCell><TableCell><Badge variant="outline">{order.currency ?? "Unknown"}</Badge></TableCell><TableCell><Badge variant={order.attribution_status === "attributed" ? "secondary" : "outline"}>{order.attribution_status === "attributed" ? "Attributed" : "Unattributed"}</Badge></TableCell><TableCell className="pr-5 text-muted-foreground">{utcTimestamp(order.created_at)}</TableCell></TableRow>)}</TableBody></Table><div className="flex flex-col gap-3 border-t border-white/10 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">Showing {from}–{to} of {filteredOrders.length}</p><div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}><ChevronLeft /> Previous</Button><span className="min-w-16 text-center text-xs tabular-nums text-muted-foreground">Page {currentPage} / {pageCount}</span><Button type="button" variant="outline" size="sm" onClick={() => setPage(Math.min(pageCount, currentPage + 1))} disabled={currentPage === pageCount}>Next <ChevronRight /></Button></div></div></> : <div className="px-5 pb-5"><EmptyState icon={ArrowDownUp} title="No orders found" description="Try a different product group, store, or search term. Verified Shopify orders will appear here." /></div>}
  </section>;
}
