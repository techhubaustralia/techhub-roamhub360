// Routes that render as standalone full-screen pages (no app sidebar/topbar). The Sidebar and
// Topbar return null on these, so the chrome never flashes behind the full-screen auth/legal pages.
const BARE_PREFIXES = ["/signin", "/signup", "/forgot", "/set-password", "/verify-email", "/sso", "/privacy", "/terms", "/checkin"];

export function isBareRoute(pathname: string): boolean {
  return BARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
