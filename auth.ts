import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { findUserByEmail, upsertSsoUser } from "@/lib/server/users";
import { verifyTeamsSsoToken } from "@/lib/server/teams-token";
import { rateLimit } from "@/lib/server/rate-limit";

// Break-glass platform operators (comma-separated env). They may access any workspace.
const BOOTSTRAP_ADMINS = (process.env.BOOTSTRAP_ADMINS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

// Full auth (Node runtime). Local email/password is always available; Microsoft
// Entra SSO is enabled only when configured — so organisations without Microsoft
// can still use RoamHub360 with local accounts.
const providers: Provider[] = [
  Credentials({
    name: "Email & password",
    credentials: { email: {}, password: {}, totp: {} },
    async authorize(creds) {
      const email = String(creds?.email ?? "").toLowerCase().trim();
      const password = String(creds?.password ?? "");
      if (!email || !password) return null;
      // Brute-force throttle: cap failed attempts per account (20 / 15 min). A correct login
      // still succeeds within the window; only guessing is slowed.
      if (!rateLimit(`login:${email}`, 20, 15 * 60 * 1000).ok) return null;
      const u = await findUserByEmail(email);
      if (!u?.passwordHash) return null; // no local password (SSO-only or unknown)
      const ok = await bcrypt.compare(password, u.passwordHash);
      if (!ok) return null;
      // Two-factor: if enabled, a valid current TOTP code is also required.
      if (u.totpEnabled && u.totpSecret) {
        const { verifyTotp } = await import("@/lib/server/totp");
        if (!verifyTotp(u.totpSecret, String(creds?.totp ?? ""))) return null;
      }
      return { id: u.id, email: u.email, name: u.name ?? email };
    },
  }),
  // SSO handoff: OAuth runs on the fixed main host (one registered redirect URI); it then hands a
  // short-lived signed token to the tenant subdomain, which exchanges it here for its own session.
  // SAFE by design — only admits users ALREADY provisioned (no auto-join of a customer workspace by
  // a random Microsoft/Google account); the getUser membership guard still enforces tenant access.
  Credentials({
    id: "sso-handoff",
    name: "SSO",
    credentials: { token: {} },
    async authorize(creds) {
      const { verifyHandoffToken } = await import("@/lib/server/account-token");
      const h = verifyHandoffToken(String(creds?.token ?? ""));
      if (!h?.email) return null;
      const u = await findUserByEmail(h.email).catch(() => null);
      if (!u) return null; // not provisioned in this workspace → refuse
      return { id: u.id, email: u.email, name: u.name ?? h.email };
    },
  }),
];

if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID) {
  providers.unshift(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      // Multi-tenant: accept any Microsoft org. Set to a tenant id to restrict.
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? "https://login.microsoftonline.com/common/v2.0",
    }),
  );

  // Teams SSO: a user inside a Teams tab hands us the token from teams-js getAuthToken();
  // /teams exchanges it here for a normal Auth.js session. No browser redirect, no password.
  // Provisioning + role attachment happen in the signIn/jwt callbacks (same path as Entra SSO).
  providers.push(
    Credentials({
      id: "teams-sso",
      name: "Microsoft Teams",
      credentials: { token: {} },
      async authorize(creds) {
        const profile = await verifyTeamsSsoToken(String(creds?.token ?? ""));
        if (!profile?.email) return null;
        const existing = await findUserByEmail(profile.email).catch(() => null);
        return {
          id: existing?.id ?? profile.email,
          email: profile.email,
          name: profile.name ?? existing?.name ?? profile.email,
        };
      },
    }),
  );
}

if (process.env.AUTH_GOOGLE_ID) {
  providers.unshift(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      // Provision a local row for first-time SSO users (Entra or Google) — role: staff.
      if (account && account.provider !== "credentials" && user?.email) {
        await upsertSsoUser(user.email.toLowerCase(), user.name ?? undefined, account.provider);
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      const email = (user?.email ?? token.email)?.toString().toLowerCase();
      // Platform-admin flag is cheap and set every time (so existing sessions get it without re-login).
      if (email) token.platformAdmin = BOOTSTRAP_ADMINS.includes(email);
      // Attach role/sites from the User table on sign-in, on refresh, or if missing.
      if (email && (user || trigger === "update" || token.role === undefined)) {
        const u = await findUserByEmail(email).catch(() => null);
        token.role = u?.role ?? "staff";
        token.sites = u?.sites ?? [];
        token.multiBook = u?.multiBook ?? false;
        token.uid = u?.id;
        token.homeTenant = u?.tenantId ?? undefined;
      }
      return token;
    },
    // session callback is shared from auth.config (edge + node) — maps token claims onto the session.
  },
});
