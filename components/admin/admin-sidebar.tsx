"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  LayoutDashboard,
  LogOut,
  Package,
  Settings2,
  Store,
  Waypoints,
  Webhook,
} from "lucide-react";
import { signOutAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const navigation = [
  {
    label: "Operations",
    items: [
      { href: "/admin", label: "System overview", icon: LayoutDashboard },
      { href: "/admin/routing", label: "Product groups", icon: Waypoints },
    ],
  },
  {
    label: "Catalog & stores",
    items: [
      { href: "/admin/stores", label: "Stores", icon: Store },
      { href: "/admin/products", label: "Products & links", icon: Package },
      { href: "/admin/orders", label: "Orders & ledger", icon: Boxes },
      { href: "/admin/webhooks", label: "Webhook health", icon: Webhook },
    ],
  },
  {
    label: "Insights & system",
    items: [
      { href: "/admin/analytics", label: "Deep analytics", icon: BarChart3 },
      { href: "/admin/audit", label: "Activity log", icon: Activity },
      { href: "/admin/settings", label: "System", icon: Settings2 },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <Sidebar
      collapsible="icon"
      variant="inset"
      className="border-r border-white/10"
    >
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="landing-mark">
            <ArrowLeftRight className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate font-serif text-lg font-semibold">
              Target<em className="not-italic text-[#f2c96d]">Flow</em>
            </p>
            <p className="text-xs text-muted-foreground">Traffic operations</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {navigation.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        pathname === item.href ||
                        (item.href !== "/admin" &&
                          pathname.startsWith(`${item.href}/`))
                      }
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <item.icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <Separator />
        <form action={signOutAction} className="p-2">
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start"
          >
            <LogOut aria-hidden="true" />
            <span>Sign out</span>
          </Button>
        </form>
      </SidebarFooter>
    </Sidebar>
  );
}
