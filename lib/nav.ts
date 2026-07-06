import {
  Home,
  LayoutGrid,
  CalendarCheck,
  BarChart3,
  Building2,
  Star,
  Users,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

export type Role = "global-admin" | "site-admin" | "staff";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[]; // who may see this item; omitted = everyone
}

export const NAV_MAIN: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/book", label: "Book a space", icon: LayoutGrid },
  { href: "/mine", label: "My bookings", icon: CalendarCheck },
];

// Admin items are role-scoped. Site Admins manage bookings + permanent desks only;
// floor plans, buildings, insights, and user/role management are Global-Admin only.
export const NAV_ADMIN: NavItem[] = [
  { href: "/insights", label: "Insights", icon: BarChart3, roles: ["global-admin"] },
  { href: "/buildings", label: "Buildings", icon: Building2, roles: ["global-admin"] },
  { href: "/assign", label: "Permanent desks", icon: Star, roles: ["global-admin", "site-admin"] },
  { href: "/admin/users", label: "Users & roles", icon: Users, roles: ["global-admin"] },
  { href: "/admin/audit", label: "Activity log", icon: ScrollText, roles: ["global-admin"] },
];
