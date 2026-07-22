import NextAuth, { CredentialsSignin } from "next-auth";
import type { Provider } from "next-auth/providers";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { tenantFromHost, requestHost } from "@/lib/tenant-host";
import { findUserByEmail, upsertSsoUser } from "@/lib/server/users";
import { findTenantByEntraTid } from "@/lib/server/entra-sso";
import { verifyTeamsSsoToken } from "@/lib/server/teams-token";
import { rateLimit } from "@/lib/server/rate-limit";
import { redactEmail } from "@/lib/redact";

// Break-glass platform operators (comma-separated env). They may access any workspace.
const BOOTSTRAP_ADMINS = (process.env.BOOTSTRAP_ADMINS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

// ---- Microsoft sign-in (MULTI-TENANT) ------------------------------------------------------------
//
// Use the BUILT-IN MicrosoftEntraID provider. It already handles multi-tenant correctly: after the
// code exchange, @auth/core decodes the id_token, reads its real `tid` claim, rewrites the
// authorization-server issuer to that tenant and re-runs discovery — so an id_token issued by ANY
// customer's directory validates. (See @auth/core .../callback/oauth/callback.js, the
// `case "microsoft-entra-id"` branch, which is gated on the provider's internal `conformInternal`
// flag — a hand-rolled provider does NOT get that behaviour.)
//
// Therefore:
//   • The issuer MUST stay ".../common/v2.0" — that's the template Auth.js rewrites per tenant.
//     Pinning it to one directory makes sign-in single-org and refuses every other company with
//     "Selected user account does not exist in tenant '<yours>'".
//   • It must never be an EMPTY string. Auth.js populates provider.issuer from the
//     AUTH_MICROSOFT_ENTRA_ID_ISSUER env var, and its internal fallback uses `??`, which does NOT
//     catch "" — an empty value yields `TypeError: "as.issuer" must not be empty`. Hence `||` below,
//     so a blank env var still falls back to the working default.
const ENTRA_ISSUER = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.trim() || "https://login.microsoftonline.com/common/v2.0";

// Auth.js reads AUTH_MICROSOFT_ENTRA_ID_ISSUER straight from the environment in several places and
// merges it with `??`, which does NOT treat "" as missing — so a present-but-blank variable wins over
// anything we pass in code and sign-in dies with `"as.issuer" must not be empty`. Normalise the
// variable itself, once, so every consumer sees a valid issuer no matter how the app was launched.
if (!process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.trim()) {
  process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER = ENTRA_ISSUER;
}

/** Decode a JWT payload WITHOUT verifying the signature. Only ever used on an id_token fetched
 *  server-side directly from Microsoft's token endpoint over TLS, which OIDC Core §3.1.3.7 permits
 *  to be trusted without re-validation. Used solely to read the `tid` (directory) claim. */
function jwtPayload(token?: string | null): Record<string, unknown> | null {
  const part = token?.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Sign-in rejections carry a machine-readable `code` so the sign-in form can tell the user WHAT
// went wrong (wrong password vs 2FA needed vs wrong workspace) instead of silently revealing a
// "code" field on every failure. Every rejection is also logged server-side with its real reason.
//
// ENUMERATION SAFETY: only `bad_credentials` is reachable before the password is verified — every
// other code is emitted AFTER a correct password, so none of them reveal whether an account exists.
class SignInRejected extends CredentialsSignin {
  constructor(public code: string) {
    super(code);
  }
}

function rejectSignIn(code: string, email: string, detail?: string): never {
  console.warn(`[auth] sign-in rejected (${code}) for ${redactEmail(email)}${detail ? ` — ${detail}` : ""}`);
  throw new SignInRejected(code);
}

// Tenant lock: a sign-in is only valid on the workspace subdomain the account belongs to. This is
// what keeps each tenancy's login SEPARATE — a default/app account can't authenticate on
// test123.roamhub360.com (and vice versa). Platform operators are exempt (support/impersonation).
// Returns true when the account may sign in on the host of `request`.
function accountMatchesHost(userTenantId: string | null | undefined, email: string, request?: Request): boolean {
  if (BOOTSTRAP_ADMINS.includes(email.toLowerCase())) return true;
  const sub = tenantFromHost(request ? requestHost(request) : "");
  const home = userTenantId ?? "default";
  return home === sub;
}

// Full auth (Node runtime). Local email/password is always available; Microsoft
// Entra SSO is enabled only when configured — so organisations without Microsoft
// can still use RoamHub360 with local accounts.
const providers: Provider[] = [
  Credentials({
    name: "Email & password",
    credentials: { email: {}, password: {}, totp: {} },
    async authorize(creds, request) {
      const email = String(creds?.email ?? "").toLowerCase().trim();
      const password = String(creds?.password ?? "");
      if (!email || !password) rejectSignIn("bad_credentials", email || "(blank)", "email or password missing");
      // Brute-force throttle: cap failed attempts per account (20 / 15 min). A correct login
      // still succeeds within the window; only guessing is slowed.
      if (!(await rateLimit(`login:${email}`, 20, 15 * 60 * 1000)).ok) rejectSignIn("rate_limited", email, "too many attempts");
      const u = await findUserByEmail(email).catch((e) => {
        console.error(`[auth] DB lookup failed for ${redactEmail(email)}: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      });
      // No local password = SSO-only or unknown account. Reported generically (this is the ONLY
      // pre-password branch, so it must not distinguish "no such user" from "SSO-only").
      if (!u?.passwordHash) rejectSignIn("bad_credentials", email, u ? "account has no password (SSO-only or invite not completed)" : "no such user");
      const ok = await bcrypt.compare(password, u.passwordHash);
      if (!ok) rejectSignIn("bad_credentials", email, "wrong password");
      // TENANT LOCK: this account may only sign in on its own workspace's subdomain. Without this,
      // a valid account authenticates on ANY subdomain and then gets bounced — the cross-tenancy bug.
      if (!accountMatchesHost(u.tenantId, email, request)) {
        rejectSignIn("wrong_workspace", email, `account belongs to "${u.tenantId ?? "default"}" but signed in on "${tenantFromHost(request ? requestHost(request) : "")}"`);
      }
      // Self-serve signups must confirm their email before the first sign-in.
      if (u.mustVerify) rejectSignIn("unverified", email, "email not verified yet");
      // Two-factor: if enabled, a valid current TOTP code is also required.
      if (u.totpEnabled && u.totpSecret) {
        const code = String(creds?.totp ?? "").trim();
        if (!code) rejectSignIn("totp_required", email, "2FA enabled, no code supplied");
        const { verifyTotp } = await import("@/lib/server/totp");
        if (!verifyTotp(u.totpSecret, code)) rejectSignIn("totp_invalid", email, "2FA code incorrect");
      }
      console.log(`[auth] sign-in OK for ${redactEmail(email)} (workspace "${u.tenantId ?? "default"}")`);
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
    async authorize(creds, request) {
      const { verifyHandoffToken } = await import("@/lib/server/account-token");
      const h = verifyHandoffToken(String(creds?.token ?? ""));
      if (!h?.email) {
        console.warn("[auth] SSO handoff rejected: invalid or expired handoff token");
        return null;
      }
      const u = await findUserByEmail(h.email).catch(() => null);
      if (!u) {
        console.warn(`[auth] SSO handoff rejected: ${redactEmail(h.email)} is not provisioned in this workspace`);
        return null;
      }
      // Same tenant lock as password login: the relayed SSO session only lands on the account's own
      // workspace subdomain (platform operators excepted).
      if (!accountMatchesHost(u.tenantId, h.email, request)) {
        console.warn(`[auth] SSO handoff rejected: ${redactEmail(h.email)} belongs to "${u.tenantId ?? "default"}", relayed to "${tenantFromHost(request ? requestHost(request) : "")}"`);
        return null;
      }
      console.log(`[auth] SSO handoff OK for ${redactEmail(h.email)}`);
      return { id: u.id, email: u.email, name: u.name ?? h.email };
    },
  }),
];

if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID) {
  providers.unshift(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: ENTRA_ISSUER,
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
  // Set AUTH_DEBUG=true in .env to make Auth.js print the UNDERLYING cause of an OAuth failure
  // (issuer mismatch, invalid_client, etc.) instead of just "?error=OAuthCallbackError" in the URL.
  // Leave it off in normal operation — debug logs are verbose and include token metadata.
  debug: process.env.AUTH_DEBUG === "true",
  logger: {
    error(error) {
      // Always surface the real reason server-side, even with debug off.
      console.error(`[auth][error] ${error.name}: ${error.message}`, (error as { cause?: unknown }).cause ?? "");
    },
    warn(code) {
      console.warn(`[auth][warn] ${code}`);
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account && account.provider !== "credentials" && user?.email) {
        const email = user.email.toLowerCase();
        // SECURITY: SSO must not be an open door. Known users and platform operators sign in;
        // unknown accounts are admitted only via (a) ORG SIGN-IN — their Entra directory (`tid`
        // claim from Microsoft's signed id_token) was admin-consent connected to a workspace, so
        // they auto-join THAT workspace — or (b) the SSO_AUTO_JOIN_DOMAINS allowlist. Everyone
        // else must be invited by an admin first.
        // Any THROW in this callback surfaces to the browser as a generic ?error=OAuthCallbackError,
        // so every DB write here is guarded and logged — a failure must name itself in the log.
        const provision = async (tenantId?: string): Promise<boolean> => {
          try {
            await upsertSsoUser(email, user.name ?? undefined, account.provider, tenantId);
            console.log(`[auth] SSO sign-in OK for ${redactEmail(email)} via ${account.provider}${tenantId ? ` → workspace "${tenantId}"` : ""}`);
            return true;
          } catch (e) {
            console.error(`[auth] SSO provisioning FAILED for ${redactEmail(email)}: ${e instanceof Error ? e.message : String(e)}`);
            return false; // fail closed, but the log names the real cause
          }
        };

        const existing = await findUserByEmail(email).catch((e) => {
          console.error(`[auth] SSO user lookup failed for ${redactEmail(email)}: ${e instanceof Error ? e.message : String(e)}`);
          return null;
        });
        if (existing || BOOTSTRAP_ADMINS.includes(email)) return provision();

        // The signing-in Microsoft directory (tenant) id. With the OAuth2 provider the `profile` is
        // Graph /me, which has no `tid` — so read it from the id_token the token endpoint returned.
        const claims = jwtPayload((account as { id_token?: string }).id_token);
        const tid =
          typeof claims?.tid === "string" ? claims.tid
          : typeof (profile as { tid?: unknown } | undefined)?.tid === "string" ? (profile as { tid: string }).tid
          : null;
        if (tid) {
          const orgTenant = await findTenantByEntraTid(tid).catch((e) => {
            console.error(`[auth] org-SSO lookup failed for tid ${tid}: ${e instanceof Error ? e.message : String(e)}`);
            return null;
          });
          if (orgTenant) return provision(orgTenant);
        }
        const domains = (process.env.SSO_AUTO_JOIN_DOMAINS || "")
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (domains.includes(email.split("@")[1] ?? "")) return provision();

        // Unknown account — needs an invite, an org-SSO connection, or an allowlisted domain.
        console.warn(`[auth] SSO sign-in DENIED for ${redactEmail(email)}: not provisioned, Entra tid ${tid ?? "(none)"} not linked to a workspace, and domain not in SSO_AUTO_JOIN_DOMAINS`);
        return false;
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
