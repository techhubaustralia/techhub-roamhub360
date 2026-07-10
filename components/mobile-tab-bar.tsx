"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, LayoutGrid, CalendarCheck, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// Native-feeling bottom tab bar for phones — primary navigation always a thumb away. Mobile only
// (md:hidden); the top hamburger still covers Settings/admin. Respects the presence feature flag
// and the bottom safe-area inset.
const TABS = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/book", label: "Book", icon: LayoutGrid },
  { href: "/mine", label: "Bookings", icon: CalendarCheck },
  { href: "/team", label: "Who's in", icon: UserCheck, flag: "presence" },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const [disabled, setDisabled] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setDisabled(u?.disabledFeatures ?? []))
      .catch(() => {});
  }, []);

  const tabs = TABS.filter((t) => !t.flag || !disabled.includes(t.flag));
  const active = (t: (typeof TABS)[number]) => (t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/"));

  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      {tabs.map((t) => {
        const Icon = t.icon;
        const on = active(t);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10.5px] font-medium transition-colors",
              on ? "text-primary" : "text-txt-mute",
            )}
          >
            <Icon className={cn("size-[22px] transition-transform", on && "scale-110")} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
