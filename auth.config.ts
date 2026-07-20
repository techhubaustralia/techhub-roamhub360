import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";
import { tenantFromHost, requestHost } from "@/lib/tenant-host";

export { tenantFromHost, requestHost } from "@/lib/tenant-host";

// Edge-safe base config, shared with middleware. NO database, bcrypt, or provider
// secrets here (middleware runs on the edge runtime). The full provider list +
// credential/DB logic lives in ./auth.ts (Node runtime).

// Paths reachable without a session. Everything else requires auth.
// (checkin/checkout/jobs are self-secured by HMAC / JOBS_SECRET; /teams is the SSO bridge;
//  /api/v1 is the public REST API, self-secured by per-tenant API keys.)
// /api/admin/entra/callback is the Entra admin-consent return URL — the consenting IT admin may
// have no session on the main host; it is self-secured by an HMAC-signed state parameter.
const PUBLIC = ["/signin", "/signup", "/forgot", "/set-password", "/verify-email", "/sso", "/privacy", "/terms", "/api/auth", "/api/account", "/api/signup", "/api/checkin", "/api/checkout", "/api/jobs", "/api/v1", "/api/health", "/api/billing/webhook", "/teams", "/api/tenants/verify", "/api/admin/entra/callback"];

function isPublic(pathname: string): boolean {
  return PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// A redirect to /signin ON THE SAME SUBDOMAIN the user is visiting. Built from the forwarded host so
// AUTH_URL (pinned to the main host for OAuth) can NEVER bounce a tenant visitor to another workspace.
function signinOnSameHost(request: { headers: Headers }, workspace?: string): NextResponse {
  const host = requestHost(request);
  const proto = request.headers.get("x-forwarded-proto") || "https";
  // `workspace` = the workspace this session actually belongs to. We do NOT auto-redirect there
  // (that was the cross-tenancy bouncing); the sign-in page just offers it as a link the user clicks.
  const q = workspace ? `?workspace=${encodeURIComponent(workspace)}` : "";
  return NextResponse.redirect(`${proto}://${host}/signin${q}`);
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
      // Not signed in: API routes self-enforce (getUser → 401); page routes go to THIS subdomain's
      // sign-in. We never `return false` for pages, because that lets Auth.js build the redirect from
      // AUTH_URL (the main host) and bounce a tenant visitor off their own subdomain.
      if (!auth?.user) return pathname.startsWith("/api") ? false : signinOnSameHost(request);
      // Tenant isolation: a user may ONLY use their own workspace's subdomain. Platform admins may
      // access any workspace (support). API routes self-enforce via getUser, so only pages redirect.
      const u = auth.user as { homeTenant?: string; platformAdmin?: boolean };
      if (u.platformAdmin || pathname.startsWith("/api")) return true;
      const sub = tenantFromHost(requestHost(request));
      const home = u.homeTenant ?? "default";
      if (home === sub) return true;
      // Session belongs to a DIFFERENT workspace. Never bounce across tenancies — deny here and show
      // THIS subdomain's sign-in, telling them which workspace they actually belong to so they can
      // click through instead of hitting an apparent "signed in but stuck at sign-in" loop.
      return signinOnSameHost(request, home);
    },
  },
} satisfies NextAuthConfig;
