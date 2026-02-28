"use client";

import { AppSidebar } from "@/components/AppSidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type AppChromeProps = {
  children: React.ReactNode;
};

export function AppChrome({ children }: AppChromeProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-800 px-4">
          <SidebarTrigger className="-ml-1 text-slate-300 hover:text-slate-100" />
          <Separator orientation="vertical" className="mr-2 h-4 bg-slate-700" />
          <span className="text-sm font-medium text-slate-400">
            BrowserQA Unified Pipeline
          </span>
        </header>
        <main className="flex-1 overflow-y-auto min-h-0 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
