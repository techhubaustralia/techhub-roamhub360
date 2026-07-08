import {
  Home,
  LayoutGrid,
  CalendarCheck,
  UserCheck,
  BarChart3,
  Building2,
  Star,
  Users,
  Contact,
  Plug,
  ScrollText,
  Boxes,
  QrCode,
  Terminal,
  BadgeCheck,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type Role = "global-admin" | "site-admin" | "staff";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[]; // who may see this item; omitted = everyone
  platform?: boolean; // platform operators only (TechHub Australia), not per-tenant admins
  flag?: string; // hidden when this feature key is in the tenant's disabled list (CP3 flags)
}

export const NAV_MAIN: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/book", label: "Book a space", icon: LayoutGrid },
  { href: "/mine", label: "My bookings", icon: CalendarCheck },
  { href: "/team", label: "Who's in", icon: UserCheck, flag: "presence" },
  { href: "/settings", label: "Settings", icon: Settings },
];

// Admin items are role-scoped. Site Admins manage bookings + permanent desks only;
// floor plans, buildings, insights, and user/role management are Global-Admin only.
export const NAV_ADMIN: NavItem[] = [
  { href: "/insights", label: "Insights", icon: BarChart3, roles: ["global-admin"] },
  { href: "/buildings", label: "Buildings", icon: Building2, roles: ["global-admin"] },
  { href: "/assign", label: "Permanent desks", icon: Star, roles: ["global-admin", "site-admin"] },
  { href: "/labels", label: "QR labels", icon: QrCode, roles: ["global-admin", "site-admin"] },
  { href: "/admin/users", label: "Users & roles", icon: Users, roles: ["global-admin"] },
  { href: "/admin/directory", label: "Directory", icon: Contact, roles: ["global-admin"], flag: "directory" },
  { href: "/admin/integration", label: "Microsoft 365", icon: Plug, roles: ["global-admin"] },
  { href: "/admin/license", label: "Plan & licence", icon: BadgeCheck, roles: ["global-admin"] },
  { href: "/admin/audit", label: "Activity log", icon: ScrollText, roles: ["global-admin"] },
  { href: "/admin/developer", label: "Developer & API", icon: Terminal, roles: ["global-admin"] },
  { href: "/admin/tenants", label: "Tenants", icon: Boxes, platform: true },
];
