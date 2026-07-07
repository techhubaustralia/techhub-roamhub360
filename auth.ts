import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { findUserByEmail, upsertSsoUser } from "@/lib/server/users";

// Full auth (Node runtime). Local email/password is always available; Microsoft
// Entra SSO is enabled only when configured — so organisations without Microsoft
// can still use RoamHub360 with local accounts.
const providers: Provider[] = [
  Credentials({
    name: "Email & password",
    credentials: { email: {}, password: {} },
    async authorize(creds) {
      const email = String(creds?.email ?? "").toLowerCase().trim();
      const password = String(creds?.password ?? "");
      if (!email || !password) return null;
      const u = await findUserByEmail(email);
      if (!u?.passwordHash) return null; // no local password (SSO-only or unknown)
      const ok = await bcrypt.compare(password, u.passwordHash);
      if (!ok) return null;
      return { id: u.id, email: u.email, name: u.name ?? email };
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
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string | undefined;
        session.user.sites = (token.sites as string[] | undefined) ?? [];
        session.user.multiBook = Boolean(token.multiBook);
        session.user.homeTenant = token.homeTenant as string | undefined;
      }
      return session;
    },
  },
});
