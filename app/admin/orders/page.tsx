import { Boxes } from "lucide-react";
import { OrdersLedger } from "@/components/admin/orders-ledger";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const supabase = createAdminSupabaseClient();
  const [{ data: orders }, { data: stores }, { data: groups }] = await Promise.all([
    supabase.from("orders_log").select("id, store_id, product_group_id, shopify_order_id, total_price, currency, attribution_status, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("stores").select("id, name").order("rotation_position"),
    supabase.from("product_groups").select("id, name, slug").order("name"),
  ]);

  return <main className="space-y-6 p-4 sm:p-6"><section><Badge variant="secondary"><Boxes />Orders</Badge><h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Verified order ledger.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Each verified Shopify order keeps its original checkout amount and currency. All received times are UTC.</p></section><Card><CardHeader><CardTitle>Orders</CardTitle><CardDescription>Search, filter, and review the original Shopify value for every order.</CardDescription></CardHeader><CardContent className="px-0"><OrdersLedger orders={orders ?? []} stores={stores ?? []} groups={groups ?? []} /></CardContent></Card></main>;
}
