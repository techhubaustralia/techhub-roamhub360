# 09 · Changelog

The app is versioned `0.1.0` in package.json; there are no git tags. This changelog is organised by
**development phase** (reconstructed from ~104 commits, the project memory, and current code). Most
recent first. Deploy model note: earlier phases assumed Azure; the app then migrated to a DigitalOcean
droplet. Everything below is committed to `main` on `github.com/techhubaustralia/techhub-roamhub360`.

## Enterprise-hardening pass (2026-07-21/22) — latest

External code review → all Critical/High/Medium/UX/Quality items fixed except infra-gated ones.
Verified each: `tsc` clean, **0 lint errors**, ~151 tests pass, prod `npm audit` = 0 high/critical.

**Security / correctness**
- **C1** transactional tenant purge/export (`tenant-data.ts`, `$transaction`, children-first).
- **C2** webhook SSRF closed — `redirect:"manual"` + IP-pinned egress (`ssrf.ts`, undici Agent).
- **C3** floor-plan upload validated by **magic bytes** + size, not client MIME (`image-guard.ts`).
- **C4** tenancy hardening **prepared** (FK `tenantId→Tenant.slug` + Postgres RLS) in `prisma/planned/` + `docs/C4-tenancy-hardening.md` — **not applied** (needs staging DB).
- **H1** host allowlist — only hosts under the apex map to a tenant (`tenant-host.ts`).
- **H2** API-key governance — scopes + expiry + moved to SQL `ApiKey` table (atomic).
- **H3** async, **Redis-ready** global rate limiter (in-memory default, fail-open).
- **H4** cross-replica SSE fan-out (Redis-ready live-bus).
- **H5** single shared Prisma client (was ~11 pools).
- **H6** versioned migrations replace `db push`; container migrator `migrate deploy` + self-baseline.
- **H7/U1** timezone fix — server-UTC fallback + duplicate `todayInTz` removed → one `DEFAULT_TZ`.
- **H8** idempotent, ledgered background jobs (`JobLedger`).
- **H9** dependency vulns eliminated; `overrides` for `sharp`, `fast-xml-parser`.

**Medium / UX / quality**
- **M3** structured, append-only audit + CSV export + retention.
- **M4** full Content-Security-Policy (dev-only `unsafe-eval`).
- **M5** Graph call timeouts + retry. **M7** email redaction in logs.
- **M8** AI guardrails — injection-defense prompt, `assistant-policy.ts` + tests, daily cap, audit, disclosure.
- **M2** presence queries scoped to the current tenant.
- **Q1** lint green (51→0 errors). **U4** consistent fetch error handling. **U5** a11y labels down-payment.

## Help Centre + Support (2026-07)
KB module (`lib/kb-content.ts` built-in articles, safe markdown renderer, search) + Support Centre
(tickets, attachments both ways, unread signals, requester resolve/reopen). Fixed KB "empty" admin,
Microsoft-page contradictory status, directory group-scoped sync, and the "close-the-loop" support UX.

## Auth stabilisation (2026-07)
Fixed Entra multi-tenant sign-in (restore built-in provider; it re-discovers issuer per tenant), the
phantom 2FA prompt, forgot-password for invited/SSO users, tenant-login isolation (subdomain lock,
`tenant-host.ts`), SSO relay, and Entra org-consent scope.

## Commercial SaaS + Growth (CP1–CP5, G1–G6) (2026-07)
Per-tenant Graph (encrypted), per-site licensing + enforcement, Partner control plane, feature flags,
expiry notices, billing-readiness, landing/legal pages, onboarding, upgrade nudges, white-label
branding, self-serve trials, ROI reports, per-tenant email branding.

## "Next level" tracks (2026-07)
AI concierge (provider-agnostic; verified live), real-time SSE, PWA + QR check-in + web push, public
REST API + API keys + webhooks/Slack. (SAML/SCIM deferred.)

## Multi-tenancy + Team Build-Up + Teams (2026-07)
MT1 schema → MT2 relational enforcement → MT2b storage prefixes → MT3 onboarding + membership guard +
subdomains; Team Build-Up A–F; Teams re-integration off Azure (jose token verification).

## Hosting migration + Auth build (2026-07)
Migrated off Azure (Container Apps + Azure SQL + Easy Auth) to a **DigitalOcean droplet** (Docker +
Postgres + Caddy), co-hosted with the BlueShift helpdesk. Built Auth.js v5 (replacing Easy Auth) with
email/password + Entra + Google. Prisma provider → postgresql; Docker/compose/Caddy deploy.

## Rebrand (Phase 0/1) (2026-07)
Rebranded single-tenant "Workspace Hub" (Sodali) → **RoamHub360** (TechHub Australia): `lib/brand.ts`
central config, blue palette, fonts, logo, all strings/emails/manifest. Phase-0 security quick-wins.

## Known issues (current)
- Single-instance only until Redis provisioned (H3/H4).
- C4 (FK+RLS) not applied — no DB-level tenant isolation yet.
- Billing is a stub. No staging env / CI E2E / pen-test.
- Microsoft-dependent features untested without a real Entra tenant.
- `data/*.json` demo content is gitignored (not in repo).
