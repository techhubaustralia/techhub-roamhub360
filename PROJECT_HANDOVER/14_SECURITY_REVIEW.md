# 14 · Security Review

This reflects the state **after** the 2026-07 enterprise-hardening pass (all external-review
Critical/High/Medium items fixed except infra-gated ones). See also `docs/SECURITY-CHECKLIST.md`,
`docs/C4-tenancy-hardening.md`.

## Authentication

- **Auth.js v5**, JWT sessions (no DB session store). Providers: email/password (bcrypt), Microsoft
  Entra (multi-tenant, org-consent), Google, Teams SSO.
- **Tenant lock:** sign-in only succeeds on the subdomain matching the account's `tenantId`
  (`accountMatchesHost`); platform operators exempt. Cookies are **host-scoped** (no domain) so sessions
  don't leak across subdomains.
- **Enumeration-safe:** only `bad_credentials` is reachable pre-password; forgot-password always returns
  `{ok:true}`. Machine-readable rejection codes; **emails redacted in logs** (M7).
- **Brute-force:** per-account login rate limit (20/15 min); TOTP 2FA supported; email verification for self-serve signups.
- **Teams token** verified server-side (jose) against Microsoft JWKS with audience + issuer-shape checks.
- **getUser()** is the single server identity choke-point; no session + prod = fail-closed anon.
- **Host allowlist (H1):** only hosts under the `APP_URL` apex map to a tenant.

## Authorization

- RBAC (`global-admin`/`site-admin`/`staff` + `platformAdmin`) enforced in nav, route handlers, and a
  **membership guard** (a user can't access another tenant's workspace).
- **Feature flags** enforced server-side, not just hidden in UI.
- **API keys** carry least-privilege **scopes** (`read`/`write`) enforced by `apiGuard(req, scope)` and
  are tenant-scoped by request host.

## Secrets management

- Secrets in env (compose `environment:` block / `.env`, gitignored). `.env.example` documents names only.
- Per-tenant Graph client secrets **encrypted at rest** (AES-256-GCM, `CREDENTIAL_KEY`), write-only, never
  returned to the browser (`crypto.ts`, `tenant-integration.ts`).
- API keys stored as **SHA-256 hashes** (shown once); prefix kept for display; `hash` unique.
- **Never** echo secrets in logs/tool calls. `CREDENTIAL_KEY` and VAPID keys must stay **stable**.

## Encryption

- TLS via Caddy (auto-ACME) at the edge. AES-256-GCM for tenant Graph secrets. bcrypt for passwords.
  SHA-256 for high-entropy API tokens (appropriate — no brute-force surface).

## Rate limiting

- `lib/server/rate-limit.ts` — async fixed-window; in-memory per-process by default, **global via Redis**
  when `REDIS_URL` set (H3), fail-open on Redis error. Applied to auth, account, assistant (20/min +
  daily cap), bookings, support, directory sync, public API (120/min/key), etc.
- **`clientIp()` uses the LAST X-Forwarded-For entry** (proxy-appended) — spoof-resistant behind Caddy.

## Audit logging

- Append-only `AuditLog` (M3): actor, action, detail, auto-captured IP/user-agent/request-id, optional
  before/after (privilege changes), retention prune, CSV export (injection-guarded).
- All platform-admin actions (tenant status/features/licence/impersonate) are audited.

## Content security & egress

- **Full CSP** (M4) — `default-src 'self'`, locked connect/img/font/frame/object/base; `unsafe-eval` in
  **dev only**. HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `frame-ancestors` for Teams.
- **SSRF-safe webhooks** (C2): `redirect:"manual"` + IP-pinned undici Agent blocks private/metadata IPs;
  Slack must be `hooks.slack.com`.
- **Upload validation** (C3): floor-plan images validated by **magic bytes** + size, served with nosniff.
- **Safe markdown** renderer (escapes input, sanitises hrefs) for KB.
- **AI guardrails** (M8): injection-defense system prompt, read-only+propose-only tool surface (tested),
  daily spend cap, audited, data-processing disclosure in the UI.

## Known risks / gaps

- **No DB-level tenant isolation yet** — the strongest remaining gap. Application code enforces tenancy;
  a forgotten `tenantId` filter would leak. **Mitigation prepared** (C4 FK + RLS, `prisma/planned/`) —
  apply on staging first with the leak test.
- **Single instance** — in-memory rate-limit/SSE are correct only for one replica until Redis is set.
- **No external pen-test.**
- **Microsoft-integration paths** untested against a real Entra tenant.
- **Blob-style config** whole-file writes (M6) — small-scale-safe race.

## Recommendations (priority order)

1. Stand up a **staging Postgres**; apply and validate **C4 (FK + RLS)** with the two-tenant leak test; wire `withTenant()`.
2. Commission an **external penetration test** before enterprise GA.
3. Provision **Redis** before scaling beyond one replica (`REDIS_URL`).
4. Add a **CI pipeline** running tsc + lint + vitest + `audit:ci` + Playwright against staging.
5. Formalise **`CREDENTIAL_KEY` rotation** (re-encrypt tenant secrets) and backup/restore drills.
6. Complete the **WCAG** audit (U5 was a down-payment).
