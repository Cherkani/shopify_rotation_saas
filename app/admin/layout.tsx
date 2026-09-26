import { AdminNotifications } from "@/components/admin/admin-notifications";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireAdmin();
  const supabase = createAdminSupabaseClient();
  const [{ data: groups }, { data: members }, { data: listings }, { data: stores }] = await Promise.all([
    supabase.from("product_groups").select("id, name"),
    supabase.from("product_group_members").select("group_id, store_product_id"),
    supabase.from("store_products").select("id, store_id"),
    supabase.from("stores").select("id, name, webhook_secret_hint"),
  ]);
  const storeMap = new Map((stores ?? []).map((store) => [store.id, store]));
  const listingStoreMap = new Map((listings ?? []).map((listing) => [listing.id, listing.store_id]));
  const alerts = (groups ?? []).map((group) => ({ groupId: group.id, groupName: group.name, stores: (members ?? []).filter((member) => member.group_id === group.id).map((member) => storeMap.get(listingStoreMap.get(member.store_product_id) ?? "")).filter((store) => !store?.webhook_secret_hint).map((store) => store?.name ?? "Unknown store") })).filter((alert) => alert.stores.length);
  return <SidebarProvider className="ops-shell">
    <AdminSidebar />
    <SidebarInset>
      <header className="flex h-16 items-center gap-3 border-b border-white/10 bg-[#161411]/85 px-4 backdrop-blur sm:px-6">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-4" />
        <div className="min-w-0"><p className="text-sm font-semibold">Product operations</p><p className="hidden text-xs text-muted-foreground sm:block">Product routes · Store webhooks · Performance</p></div>
        <div className="ml-auto flex items-center gap-2 text-xs text-[#aaa196]"><AdminNotifications alerts={alerts} /></div>
      </header>
      {children}
    </SidebarInset>
  </SidebarProvider>;
}
