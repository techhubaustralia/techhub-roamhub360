import { LocationPicker } from "./location-picker";
import { ThemeToggle } from "./theme-toggle";
import { TeamsBadge } from "./teams-badge";
import { MobileNav } from "./mobile-nav";
import { NotificationsBell } from "./notifications-bell";

export function Topbar() {
  return (
    <header className="flex items-center gap-3 border-b bg-card px-4 py-3 md:px-6">
      <MobileNav />
      <LocationPicker />
      <div className="flex-1" />
      <TeamsBadge />
      <ThemeToggle />
      <NotificationsBell />
    </header>
  );
}
