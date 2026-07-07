"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_MAIN, NAV_ADMIN, type NavItem, type Role } from "@/lib/nav";
import { signOut } from "next-auth/react";
import { RoamHubMark } from "@/components/roamhub-mark";
import { brand } from "@/lib/brand";

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "group flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13.5px] font-medium transition-all",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-txt-dim hover:translate-x-0.5 hover:bg-panel-2 hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0 transition-transform group-hover:scale-110" />
      {item.label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const [user, setUser] = useState<{ name: string; email: string; role?: Role; platformAdmin?: boolean }>({ name: "You", email: "" });
  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => u && setUser(u))
      .catch(() => {});
  }, []);

  // Show an admin item only if the user's role is allowed (role unknown → none).
  const adminItems = NAV_ADMIN.filter((i) =>
    i.platform ? !!user.platformAdmin : !i.roles || (user.role ? i.roles.includes(user.role) : false),
  );

  return (
    <aside className="hidden w-[244px] flex-col border-r bg-sidebar md:flex">
      <div className="flex items-center gap-2.5 px-[18px] py-[18px]">
        <RoamHubMark className="size-[30px] shrink-0" />
        <div className="leading-none">
          <div className="font-heading text-[15px] font-bold tracking-[0.02em] text-foreground">{brand.productName}</div>
          <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-txt-mute">by {brand.company}</div>
        </div>
      </div>

      <Link
        href="/book"
        className="mx-3.5 mb-2 mt-1 flex items-center justify-center gap-1.5 rounded-[11px] bg-primary px-3 py-[11px] text-sm font-bold text-primary-foreground transition-colors hover:bg-orange-soft"
      >
        <Plus className="size-4" /> New booking
      </Link>

      <nav className="flex-1 overflow-auto px-3 py-1.5">
        <div className="flex flex-col gap-0.5">
          {NAV_MAIN.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </div>
        {adminItems.length > 0 && (
          <>
            <div className="px-3 pb-1.5 pt-3.5 text-[10px] font-bold uppercase tracking-[0.12em] text-txt-mute">
              Administration
            </div>
            <div className="flex flex-col gap-0.5">
              {adminItems.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item.href)} />
              ))}
            </div>
          </>
        )}
      </nav>

      <div className="flex items-center gap-2.5 border-t px-3.5 py-3">
        <div className="grid size-[34px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2b7dd1] to-[#29c5ee] text-xs font-bold text-white">
          {initials(user.name)}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <b className="block truncate text-[13px]">{user.name}</b>
          <span className="block truncate text-[11.5px] text-txt-mute">{user.email}</span>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/signin" })}
          title="Sign out"
          aria-label="Sign out"
          className="grid size-8 shrink-0 place-items-center rounded-[9px] text-txt-mute transition-colors hover:bg-panel-2 hover:text-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </aside>
  );
}
