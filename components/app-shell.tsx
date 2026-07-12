"use client";

import { usePathname } from "next/navigation";
import { isBareRoute } from "@/lib/bare-routes";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { AssistantWidget } from "@/components/assistant-widget";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { InstallPrompt } from "@/components/install-prompt";

// Decides the app chrome at the top level. On standalone/full-screen routes (sign-in, password
// reset, SSO handoff, legal, QR check-in) it renders ONLY the page — no sidebar/topbar — so those
// never flash behind the full-screen content. Everywhere else it renders the normal grid + chrome.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isBareRoute(pathname)) {
    return (
      <main id="main" className="h-full overflow-auto">
        {children}
      </main>
    );
  }

  return (
    <>
      <div className="grid h-screen grid-cols-1 md:grid-cols-[244px_1fr]">
        <div className="contents no-print">
          <Sidebar />
        </div>
        <div className="flex min-w-0 flex-col overflow-hidden">
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-[10px] focus:bg-primary focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-primary-foreground">
            Skip to content
          </a>
          <div className="no-print">
            <Topbar />
          </div>
          <main id="main" className="flex-1 overflow-auto px-4 py-6 pb-24 sm:px-6 md:pb-6">
            {children}
          </main>
        </div>
      </div>
      <MobileTabBar />
      <InstallPrompt />
      <div className="no-print">
        <AssistantWidget />
      </div>
    </>
  );
}
