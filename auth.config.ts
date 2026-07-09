import type { NextAuthConfig } from "next-auth";

// Edge-safe base config, shared with middleware. NO database, bcrypt, or provider
// secrets here (middleware runs on the edge runtime). The full provider list +
// credential/DB logic lives in ./auth.ts (Node runtime).

// Paths reachable without a session. Everything else requires auth.
// (checkin/checkout/jobs are self-secured by HMAC / JOBS_SECRET; /teams is the SSO bridge;
//  /api/v1 is the public REST API, self-secured by per-tenant API keys.)
const PUBLIC = ["/signin", "/signup", "/forgot", "/set-password", "/privacy", "/terms", "/api/auth", "/api/account", "/api/signup", "/api/checkin", "/api/checkout", "/api/jobs", "/api/v1", "/api/health", "/api/billing/webhook", "/teams", "/api/tenants/verify"];

function isPublic(pathname: string): boolean {
  return PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers: [], // real providers are added in ./auth.ts
  callbacks: {
    authorized({ request, auth }) {
      // Local dev has no login/DB — the app falls back to a demo admin (see getUser).
      if (process.env.NODE_ENV !== "production") return true;
      if (isPublic(request.nextUrl.pathname)) return true;
      return !!auth?.user; // signed-in session required for everything else
    },
  },
} satisfies NextAuthConfig;
