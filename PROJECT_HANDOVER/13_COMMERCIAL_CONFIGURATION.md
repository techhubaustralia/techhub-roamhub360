# 13 · Commercial Configuration

## Branding

- **Product:** RoamHub360 — "Smart Desk Booking & Workplace Management Platform", tagline
  "Space managed. Teams connected."
- **Vendor:** TechHub Australia (MSP). RoamHub360 is a sub-brand of the parent TechHub brand.
- **Central config:** `lib/brand.ts` (product name, mail-from default, etc.). Palette tokens in
  `app/globals.css` (blue-forward: primary `#2B7DD1`, accent cyan `#29C5EE`; "booked" desk status amber
  `#F5821F`). Logo: `components/roamhub-mark.tsx` + `brand/roamhub360-logo.svg`. Fonts: Sora / Plus
  Jakarta Sans / Space Grotesk.
- **Per-tenant white-label (G3):** `Tenant.brandName` / `brandAccent` / `brandLogo`. The accent
  **recolours the whole app** (injected server-side pre-paint in `app/layout.tsx`); the product name +
  logo flow via `getUser().branding` → `/api/me` → sidebar/mobile-nav. Emails are branded per-tenant
  (`emailBrand(tenantId)`, G6). The default/demo tenant uses the stock RoamHub360 brand.
- Edit a customer's branding in the Partner control plane: **`/admin/tenants` → Manage → Branding**.

## Licensing model (drives billing + enforcement)

- **Price:** AUD **$2,000 per site (building) / year**. No per-user fees, no module fees.
- **Metering unit:** a **site** (building). Hierarchy: MSP (reseller) → customer org (**tenant**) → **sites** → floors.
- **Tiers** (`License.tier`): trial / standard / professional / enterprise. Each caps **maxSites** and
  **maxFloorsPerSite** (≤5 by tier). Pure logic in `lib/license-state.ts`; presets in `licensing.ts`.
- **Enforcement (server-side, un-bypassable):** creating a building checks the **site allowance**;
  setting floors checks the **floor cap**; when a licence is **expired/suspended** the workspace goes
  **read-only** (bookings POST → HTTP 402). Default tenant + local dev = **unlimited** (demo never restricted).
- **Trial:** self-serve `/signup` provisions a tenant + **14-day trial** licence + first admin — but is
  **off by default** (`ALLOW_PUBLIC_SIGNUP` must be `true`; 5/hr/IP). A customer with **no licence row** =
  implicit trial (1 site / 2 floors).
- **Expiry notifications (CP4):** the scheduler emails tenant admins + `OPS_EMAIL` at 90/60/30/14/7/1/0-day
  bands (dedup via `License.notifiedThresholds`).
- **Billing (CP4, stub):** `BILLING_PROVIDER` (stripe|marketplace|xero|myob) + `lib/server/billing.ts` +
  `/api/billing` — architecture only; Stripe env exists but no live flow.

## Tenant configuration

- Tenant resolved from **subdomain** (`<slug>.roamhub360.com`; apex/reserved → `default`).
- `Tenant` row: slug (unique), name, status (active|trial|suspended), `features` (disabled feature keys),
  branding fields.
- **Feature flags (CP3):** disable a feature per tenant (e.g. `presence`, `directory`, `assistant`); hides
  nav **and** enforced server-side.
- **Partner control plane** (`/admin/tenants`, platformAdmin only): create/list tenants, view stats
  (users/bookings/directory), edit licence (tier/sites/floors/expiry/grace), suspend/reactivate, toggle
  features, and **impersonate** (open the workspace subdomain — audited). Default tenant is protected.

## Microsoft Graph onboarding (per customer, CP1)

Each customer configures **their own** Entra app so Graph runs against **their** Microsoft 365:
1. In **`/admin/integration`** ("Microsoft 365"), the customer's Global Admin enters their **Azure tenant
   id, client id, client secret** (encrypted at rest, AES-256-GCM — needs `CREDENTIAL_KEY` set + stable).
2. **Connection test** button verifies Graph.
3. **Org sign-in** ("Connect your organisation") → Microsoft admin-consent → stores `ssoEntraTenantId`;
   thereafter any user from that directory who signs in with Microsoft **auto-joins that workspace**.
4. **Directory sync** — choose Entra **groups** to sync (not the whole tenant); pulls
   names/photos/departments/managers into `DirectoryUser` for the "Who's in" board.
- The **default/demo** tenant uses the deployment's env `GRAPH_*` + `MAIL_FROM` instead.
- Email always sends from the **single central platform mailbox** (`donotreply@roamhub360.com`); per-tenant
  Graph is used for calendar events + directory, and optionally per-tenant `mailFrom`.

## Customer onboarding flow

1. Platform operator creates the tenant in `/admin/tenants` (or the customer self-serves a trial if enabled).
2. DNS: `<slug>.roamhub360.com` resolves via the wildcard `*.roamhub360.com` (Caddy on-demand-TLS +
   `/api/tenants/verify`).
3. Provision the customer's first Global Admin (`/admin/tenants/[slug]/users`).
4. Customer connects Microsoft 365, syncs directory, creates buildings/floor plans, invites users.
5. `G1` onboarding checklist on Home guides the admin (Connect MS / add site / invite team / first booking).

## Teams deployment

- `teams/manifest.json` = a personal + configurable "Who's in" tab. GUIDs must be the Entra app client id.
- Pre-authorise the Teams client in Entra **Expose-an-API**; sideload the manifest; the tab rides **Teams
  SSO** (`lib/server/teams-token.ts`). Teams-runtime features are untested outside Teams.
