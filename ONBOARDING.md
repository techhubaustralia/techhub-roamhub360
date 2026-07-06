# Workspace Hub — Onboarding & Handover

Master handover document. Read this first, then the linked docs. No secret **values** appear here — only names and where they live.

> **Moving to another Claude account?** The code lives in git (below), independent of any Claude account. The new owner clones the repo, gets access to the Azure resources, and reads this file. Claude's local memory (`~/.claude/…`) does **not** transfer — this document is the durable replacement.

---

## 1. What it is
Workspace Hub is Sodali & Co's enterprise workspace-booking app: book **desks, offices, meeting rooms, and parking** across buildings/floors, with check-in/out, admin management, analytics, email + Outlook calendar integration, and a Microsoft Teams tab. Single sign-on via Microsoft Entra.

## 2. Repository
- **Remote:** `https://dev.azure.com/MSplatform0482/WorkSpace-Hub/_git/WorkSpace-Hub` (Azure DevOps), branch `main`
- **Local dev path:** `C:\Projects\workspace-hub`
- Clone, `npm install`, `npm run dev` → http://localhost:3000 (dev auth falls back to a global-admin identity; see `lib/server/auth.ts`).

## 3. Tech stack
- **Next.js 16** (App Router, Turbopack, `output: standalone`) — **read `AGENTS.md`**: this Next version has breaking changes; consult `node_modules/next/dist/docs/` before writing framework code.
- **React 19**, TypeScript, **Tailwind v4**, shadcn/ui, next-themes (dark default, orange accent).
- **Prisma v6** → **Azure SQL** (bookings, check-ins, locks, audit) — `prisma/schema.prisma`.
- **Azure Blob** (or local JSON in dev under `data/`) for floor plans/buildings — `lib/server/store.ts`.
- **Microsoft Graph** (app-only) for email + calendar — `lib/server/graph.ts`.
- Hosted on **Azure Container Apps** behind **Easy Auth** (Entra).

## 4. Architecture / key modules
| Area | Files |
|------|-------|
| Booking rules (windows, durations, validation, DST math) | `lib/booking-rules.ts` |
| Bookings/locks/audit persistence (SQL + file) | `lib/server/db.ts` |
| Plans/buildings/floors persistence (Blob + file) | `lib/server/store.ts` |
| Identity + RBAC | `lib/server/auth.ts`, `lib/authz.ts` |
| Email templates | `lib/server/email.ts` |
| Graph (mail, calendar events, probe) | `lib/server/graph.ts` |
| Check-in/out HMAC tokens | `lib/server/token.ts` |
| Rate limiting | `lib/server/rate-limit.ts` |
| Floor-plan rendering | `components/floorplan/floor-svg.tsx`, `editor-canvas.tsx` |
| APIs | `app/api/**` (bookings, plans, buildings, locks, roles, analytics, occupancy, checkin, checkout, jobs, diag) |
| Pages | `app/**` (home `/`, `/book`, `/mine`, `/buildings`, `/editor/[id]`, `/insights`, `/assign`, `/admin/users`, `/admin/audit`, `/teams`) |

## 5. Data model (Azure SQL — `prisma/schema.prisma`)
- **Booking** (id, userEmail, bookedByEmail, buildingId, spaceKey, spaceLabel, kind, durationType, start, end, status, eventId, cancelledBy, cancelReason, createdAt)
- **CheckIn** (per-booking-per-day) — *table exists but currently unused; see Known Gaps*
- **Lock** (buildingId, spaceKey, scope temporary|permanent, lockedBy)
- **AuditLog** (id, **at**, actor, action, detail) — note the timestamp column is `at`, not `createdAt`
- Floor-plan geometry is **not** in SQL — it's JSON in Blob (`lib/server/store.ts`), keyed by floor id (`<buildingId>` or `<buildingId>__<slug>-N`).

## 6. Features (all live on v76)
Desk/office/room/parking booking; full-day & hourly (half-day retired from UI, kept in model); multi-day desks/parking; floor-plan editor with desk/office/room/parking glyphs, 360° rotation, drag/resize/rename, move-to-floor; permanent desk/office/parking assignments; per-building quota + global one-desk rule; **8h/day desk cap for staff** (admins/office-managers exempt); site-scoped RBAC (global-admin / site-admin / staff) + **Office Manager** multi-book permission; admin cancel/reschedule/checkout; **email + Outlook calendar** confirmations/updates/cancellations (desk/office/room; full-day = all-day "Free" event); **email check-in/out** (token links, no login needed); **scheduled automation** (8:00 reminder, 9:30 auto-cancel, 17:00 checkout reminder, 17:30 auto-checkout); Insights/analytics + CSV/Excel/PDF export; Activity log; desk hover card; Teams tab.

## 7. Deployment — see **`docs/DEPLOY.md`** (full runbook)
Summary: tag image `vN` → point Container App at it. **Currently live: v76.** Single-revision mode (100% traffic to latest); rollback = redeploy previous tag.
```bash
git push origin main
az acr build -r crworkspacehubprodeastus -t workspace-hub:vN --no-logs .
az containerapp update -n ca-workspacehub-prod-eastus -g RG-WorkSpace_Hub-Prod-Eastus --image crworkspacehubprodeastus.azurecr.io/workspace-hub:vN
```
`az containerapp` REST fallback (if the CLI extension breaks) is in `docs/DEPLOY.md` §4.

## 8. Azure resources
| Thing | Value |
|-------|-------|
| Subscription | `c63bfac0-ed5f-4b88-bff3-d1a8d3aa88fe` |
| Resource group | `RG-WorkSpace_Hub-Prod-Eastus` |
| Container App | `ca-workspacehub-prod-eastus` (port 3000, custom domain `workspace.sodali.com`) |
| Managed env | `cae-workspacehub-prod-eastus` |
| Container Registry | `crworkspacehubprodeastus` |
| Entra tenant | `159343fa-29b0-46d9-a910-33cf2fa691b5` |
| Graph/SSO app (client id) | `29c0b446-4e76-4a61-a5ff-c265e5f75ab2` (Mail.Send + Calendars.ReadWrite app perms, admin-consented; also the Teams SSO app) |
| Jobs scheduler | Logic App `la-workspacehub-jobs` (Recurrence every :00/:30 → GET `/api/jobs/tick` with `x-jobs-secret`) |

## 9. Environment variables (Container App — values are secrets, not shown)
`DATABASE_URL` (secret), `AZURE_STORAGE_CONNECTION_STRING` (secret), `AZURE_STORAGE_CONTAINER`, `AZURE_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` (secret `graph-secret`), `MAIL_FROM` = `sodali.workspace@sodali.com`, `GRAPH_TIMEZONE`, `CHECKIN_SECRET` (secret), `JOBS_SECRET` (secret), `BOOTSTRAP_ADMINS`, `APP_URL`, `ROOM_MAILBOXES` (JSON map spaceKey→mailbox). Provisioning detail in `RUNBOOK.md`.

## 10. Auth & security — see **`docs/SECURITY-CHECKLIST.md`**
- Easy Auth (Entra) guards the app; **excluded paths** (bypass login, self-secured): `/api/jobs/tick`, `/api/checkin`, `/api/checkout`, `/teams`.
- Check-in/out links are HMAC-signed (`CHECKIN_SECRET`) + expiry + atomic state CAS. Jobs endpoint guarded by `JOBS_SECRET`. Bookings created under `Serializable` transactions; status changes are atomic compare-and-set.
- **Rotate `jobs-secret`** — its value was used in plaintext during setup; rotate it and update the Logic App header.

## 11. Microsoft Teams — see **`teams/README.md`**
Path A (tab wrapping the web app). Manifest ready with the client id. **Outstanding (infra):** icons (`color.png` 192×192, `outline.png` 32×32), Entra API scope `access_as_user` + Teams client pre-auth + admin consent, Easy Auth trust of the token audience, Teams admin upload. `/teams` SSO bridge is implemented but **not yet validated in a real Teams client**.

## 12. Known gaps / tech debt (honest list)
- **CheckIn table unused** — check-in/out flips the booking's single status; true per-day check-in for multi-day bookings is not implemented.
- **Teams SSO bridge untested** in a live Teams client.
- **plan-scale size drift** on non-uniform image rescale (`lib/plan-scale.ts`) — cosmetic.
- **In-memory rate limiting** is per-replica (use Redis for exact global limits at scale).
- `senderMailbox` probe in `/api/diag/graph` returns 403 without `User.Read.All` (harmless; mail/calendar work regardless).
- Insights `byKind` chart excludes parking in the UI chart (counted in totals/utilisation).

## 13. Testing
- Unit: `npx vitest run` (41 tests) — booking rules, authz, escaping.
- Types: `npx tsc --noEmit`.
- Live API regression harness patterns: `tests/api-regression.test.ts` (guarded by `E2E_BASE`).
- Diagnostics: `/api/diag/graph` (Graph health, `?send=me`, `?event=<mailbox>`), `/api/diag/[id]` (plan render check), `/api/diag/audit` (audit backend probe).

## 14. Other docs in this repo
`README.md` · `RUNBOOK.md` (Graph/Entra/env provisioning) · `docs/DEPLOY.md` (deploy + REST fallback) · `docs/SECURITY-CHECKLIST.md` · `teams/README.md` · `AGENTS.md` (Next.js caveat).

---

## 15. Going commercial — roadmap (planning topic, not yet built)
Today the app is **single-tenant** (Sodali only). Turning it into a commercial multi-customer product needs, roughly in priority order:

1. **Multi-tenancy & data isolation** — tenant id on every row (bookings/locks/audit/plans), tenant-scoped queries, per-tenant Blob containers or prefixes. This is the largest change.
2. **Tenant onboarding / self-service** — sign-up, tenant provisioning, custom domains/subdomains, per-tenant branding (logo, accent).
3. **Identity** — multi-tenant Entra app (accept any org's Entra), or add other IdPs; per-tenant admin bootstrap.
4. **Billing & licensing** — plan tiers, seat counts, Stripe or Azure Marketplace SaaS billing, usage metering, entitlement checks.
5. **Secrets & config** — move secrets to **Azure Key Vault** (referenced by Container App); per-tenant config store.
6. **CI/CD** — formal Azure DevOps pipeline (build/test/scan/deploy across Dev/Test/Prod), infra-as-code (Bicep/Terraform) for reproducible environments.
7. **Observability & SLA** — Application Insights (a skill exists for the web SDK), dashboards, alerting, uptime SLOs, structured audit retention.
8. **Compliance & security** — SOC 2 / ISO track, GDPR (data export/delete, DPA), pen-test, WCAG 2.1 AA accessibility, PII data-flow review.
9. **Scale** — Redis for rate-limit + caching, DB pooling/indexes review, load testing (k6), autoscale tuning.
10. **Marketplace packaging** — Teams app store listing + Azure Marketplace SaaS offer.

**Recommendation:** treat commercialization as its own project with a design phase — multi-tenancy (#1) and billing (#4) are the foundational decisions that shape everything else. Start there before building features.
