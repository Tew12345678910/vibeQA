"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  FolderKanban,
  LayoutDashboard,
  Play,
  Plus,
  Settings,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/suites", label: "Suites", icon: FolderKanban },
  { href: "/runs", label: "Runs", icon: Play },
  { href: "/issues", label: "Issues", icon: AlertCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-blue-500 text-slate-950">
                  <span className="text-sm font-bold">QA</span>
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold text-slate-100">BrowserQA</span>
                  <span className="text-xs text-slate-400">Studio</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <Button asChild size="sm" className="bg-blue-500 text-slate-950 hover:bg-blue-400">
          <Link href="/suites/new">
            <Plus className="mr-1 h-4 w-4" />
            New Suite
          </Link>
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(({ href, label, icon: Icon }) => {
                const active =
                  href === "/"
                    ? pathname === "/" || pathname === "/dashboard"
                    : pathname === href || pathname.startsWith(`${href}/`);

                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={label}>
                      <Link href={href}>
                        <Icon className="h-4 w-4" />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <p className="px-2 py-1 text-xs text-slate-500">BrowserQA Studio v1.0</p>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
