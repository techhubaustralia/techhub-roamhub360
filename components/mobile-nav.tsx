"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Plus, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { NAV_MAIN, NAV_ADMIN, type Role } from "@/lib/nav";
import { RoamHubMark } from "@/components/roamhub-mark";
import { brand } from "@/lib/brand";

// Mobile navigation drawer — the desktop sidebar is hidden below md, so phones
// need this to reach any page. Lives in the topbar; button shows only on mobile.
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role | undefined>(undefined);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((u) => { if (u) { setRole(u.role); setPlatformAdmin(!!u.platformAdmin); } }).catch(() => {});
  }, []);
  useEffect(() => { setOpen(false); }, [pathname]); // close on navigation

  const adminItems = NAV_ADMIN.filter((i) =>
    i.platform ? platformAdmin : !i.roles || (role ? i.roles.includes(role) : false),
  );

  const Item = ({ href, label, Icon }: { href: string; label: string; Icon: React.ComponentType<{ className?: string }> }) => (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-medium",
        isActive(href) ? "bg-primary text-primary-foreground" : "text-txt-dim hover:bg-panel-2",
      )}
    >
      <Icon className="size-4 shrink-0" /> {label}
    </Link>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="grid size-9 place-items-center rounded-[9px] border bg-panel-2 text-txt-dim md:hidden"
      >
        <Menu className="size-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-[270px] flex-col bg-sidebar shadow-2xl">
            <div className="flex items-center justify-between px-4 py-4">
              <div className="flex items-center gap-2.5">
                <RoamHubMark className="size-7" />
                <div className="leading-none">
                  <div className="font-heading text-[14px] font-bold">{brand.productName}</div>
                  <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-txt-mute">by {brand.company}</div>
                </div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="grid size-8 place-items-center rounded-[9px] text-txt-mute hover:bg-panel-2">
                <X className="size-4" />
              </button>
            </div>
            <Link href="/book" className="mx-3 mb-2 flex items-center justify-center gap-1.5 rounded-[11px] bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground">
              <Plus className="size-4" /> New booking
            </Link>
            <nav className="flex-1 overflow-auto px-3 py-1">
              <div className="flex flex-col gap-0.5">
                {NAV_MAIN.map((i) => <Item key={i.href} href={i.href} label={i.label} Icon={i.icon} />)}
              </div>
              {adminItems.length > 0 && (
                <>
                  <div className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.12em] text-txt-mute">Administration</div>
                  <div className="flex flex-col gap-0.5">
                    {adminItems.map((i) => <Item key={i.href} href={i.href} label={i.label} Icon={i.icon} />)}
                  </div>
                </>
              )}
            </nav>
            <button type="button" onClick={() => signOut({ callbackUrl: "/signin" })} className="m-3 flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium text-txt-dim hover:bg-panel-2">
              <LogOut className="size-4" /> Sign out
            </button>
          </aside>
        </div>
      )}
    </>
  );
}
