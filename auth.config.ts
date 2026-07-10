import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

// Edge-safe base config, shared with middleware. NO database, bcrypt, or provider
// secrets here (middleware runs on the edge runtime). The full provider list +
// credential/DB logic lives in ./auth.ts (Node runtime).

// Paths reachable without a session. Everything else requires auth.
// (checkin/checkout/jobs are self-secured by HMAC / JOBS_SECRET; /teams is the SSO bridge;
//  /api/v1 is the public REST API, self-secured by per-tenant API keys.)
const PUBLIC = ["/signin", "/signup", "/forgot", "/set-password", "/verify-email", "/sso", "/privacy", "/terms", "/api/auth", "/api/account", "/api/signup", "/api/checkin", "/api/checkout", "/api/jobs", "/api/v1", "/api/health", "/api/billing/webhook", "/teams", "/api/tenants/verify"];

function isPublic(pathname: string): boolean {
  return PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// Tenant slug from the request host — mirrors currentTenantId() (kept inline; tenant.ts is
// server-only and can't be imported into the edge middleware).
const RESERVED = new Set(["", "app", "www", "admin", "api", "auth", "localhost"]);
function tenantFromHost(host: string): string {
  const h = (host || "").split(":")[0].toLowerCase();
  if (!h || h === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return "default";
  const parts = h.split(".");
  const sub = parts.length > 2 ? parts[0] : "";
  return sub && !RESERVED.has(sub) ? sub : "default";
}

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: [], // real providers are added in ./auth.ts
  callbacks: {
    // Map JWT claims onto the session (edge-safe — token reads only). Shared by middleware + node.
    session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string | undefined;
        session.user.sites = (token.sites as string[] | undefined) ?? [];
        session.user.multiBook = Boolean(token.multiBook);
        session.user.homeTenant = token.homeTenant as string | undefined;
        session.user.platformAdmin = Boolean(token.platformAdmin);
      }
      return session;
    },
    authorized({ request, auth }) {
      // Local dev has no login/DB — the app falls back to a demo admin (see getUser).
      if (process.env.NODE_ENV !== "production") return true;
      const { pathname } = request.nextUrl;
      if (isPublic(pathname)) return true;
      if (!auth?.user) return false; // signed-in session required
      // Tenant isolation: a user may ONLY use their own workspace's subdomain. Platform admins may
      // access any workspace (support/impersonation). API routes self-enforce via getUser, so we
      // only redirect page navigations here.
      const u = auth.user as { homeTenant?: string; platformAdmin?: boolean };
      if (u.platformAdmin || pathname.startsWith("/api")) return true;
      const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
      const sub = tenantFromHost(host);
      const home = u.homeTenant ?? "default";
      if (home === sub) return true;
      // Wrong workspace → send them to their OWN workspace's sign-in.
      const apex = host.split(":")[0].split(".").slice(1).join(".") || "roamhub360.com";
      const target = home === "default" ? `https://app.${apex}/signin` : `https://${home}.${apex}/signin`;
      return NextResponse.redirect(target);
    },
  },
} satisfies NextAuthConfig;
