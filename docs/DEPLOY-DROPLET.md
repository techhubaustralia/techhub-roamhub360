# RoamHub360 — self-hosted deployment (DigitalOcean droplet + Coolify)

Cheap, always-on hosting off Azure. One Sydney droplet runs **Postgres + the app + TLS**.
Everything Microsoft-integrated (Graph email/calendar, Entra SSO) keeps working; storage is
a local volume (no Azure Blob). Est. cost **~AU$18/mo**.

There are two paths. **Path 1 (plain Docker Compose)** is the simplest and is what the repo's
`docker-compose.yml` is built for. **Path 2 (Coolify)** adds a web UI + git-push deploys.

---

## 0. Prerequisites
- A DigitalOcean account.
- A domain you control (e.g. `roamhub360.com`) so we can point `app.roamhub360.com` at the droplet.
- OAuth apps (optional, for SSO) — see §6.

## 1. Create the droplet
- **Droplet type:** Basic · Regular · **2 GB RAM / 1 vCPU** (min; 1 GB is tight with Postgres).
- **Region:** **Sydney (SYD1)**.
- **Image:** Ubuntu 24.04 LTS.
- Add your SSH key. Enable the DO firewall: allow **22, 80, 443**.

## 2. DNS
Point an **A record** `app.roamhub360.com` → the droplet's public IP. (TLS is issued automatically once DNS resolves.)

---

## Path 1 — Plain Docker Compose (recommended, simplest)

### 3.1 Install Docker
```bash
ssh root@<droplet-ip>
curl -fsSL https://get.docker.com | sh
```

### 3.2 Get the code + configure
```bash
git clone <your-repo-url> roamhub360 && cd roamhub360
cp .env.example .env
# Generate secrets (paste each into .env):
openssl rand -base64 32   # AUTH_SECRET
openssl rand -hex 32      # CHECKIN_SECRET
openssl rand -hex 32      # JOBS_SECRET
openssl rand -base64 32   # CREDENTIAL_KEY (encrypts each customer's Microsoft secret at rest)
```
> **CREDENTIAL_KEY** must stay stable — rotating it makes every customer's saved Microsoft secret
> unreadable (they'd have to re-enter it under **Microsoft 365** in their workspace). Back it up
> with your other secrets. Customers self-configure their own Entra app in-app (encrypted per
> tenant); the deployment-wide `GRAPH_*` vars only power the default/demo workspace.
Edit `.env` and set at minimum:
```
POSTGRES_PASSWORD=<strong>
DATABASE_URL=postgresql://roamhub:<same strong password>@db:5432/roamhub360?schema=public
SITE_ADDRESS=app.roamhub360.com
APP_URL=https://app.roamhub360.com
AUTH_SECRET=<from openssl>
CHECKIN_SECRET=<from openssl>
JOBS_SECRET=<from openssl>
BOOTSTRAP_ADMINS=you@yourdomain.com
```
(OAuth + Graph vars are optional — see §6/§7.)

### 3.3 Launch
```bash
docker compose up -d --build
```
This builds the image, runs the DB migration (`prisma db push`) once, starts the app, and Caddy
gets a Let's Encrypt cert for `SITE_ADDRESS`. Check: `docker compose ps`, `docker compose logs -f app`.

### 3.4 Create the first admin
The app image has no shell tooling, so seed via the one-off **migrate** image (it has the source + Prisma CLI):
```bash
docker compose run --rm migrate node scripts/create-admin.mjs you@yourdomain.com 'a-strong-password' 'Your Name'
```
Now open `https://app.roamhub360.com` → sign in with that email/password.

### 3.5 Updating later
```bash
git pull && docker compose up -d --build
```
The `migrate` service re-applies any schema changes on each up.

---

## Path 2 — Coolify (web UI + git-push deploys)

Coolify provides its own reverse proxy + TLS, so use the compose **without** Caddy (Coolify routes the domain).

1. **Install Coolify** on the droplet:
   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```
   Open `http://<droplet-ip>:8000` and complete setup.
2. **Add a Postgres database:** Resources → New → Database → PostgreSQL. Note its connection string → this becomes `DATABASE_URL`.
3. **Add the app:** Resources → New → Application → your Git repo. Build pack = **Dockerfile**, target = `runner`, port **3000**.
4. **Set env vars** (same as §3.2, but `DATABASE_URL` = the Coolify Postgres string; the DB host is the Coolify service name, not `db`).
5. **Set the domain** `app.roamhub360.com` in the app's settings — Coolify issues TLS.
6. **Deploy.** Then run migrations + seed once via a one-off container (Coolify → Commands, or SSH):
   ```bash
   # from the repo build image (has Prisma CLI + scripts):
   docker compose run --rm migrate                                   # prisma db push
   docker compose run --rm migrate node scripts/create-admin.mjs you@yourdomain.com 'pw' 'Name'
   ```
7. Git push → Coolify auto-redeploys.

---

## 6. OAuth sign-in (optional)

Local email/password works with no setup. To enable SSO, register redirect URIs and set env vars, then redeploy.

**Microsoft Entra** (Azure Portal → App registrations → New):
- Redirect URI (Web): `https://app.roamhub360.com/api/auth/callback/microsoft-entra-id`
- Supported account types: *Accounts in any organizational directory* (multi-tenant).
- Create a client secret. Set:
  ```
  AUTH_MICROSOFT_ENTRA_ID_ID=<application (client) id>
  AUTH_MICROSOFT_ENTRA_ID_SECRET=<client secret value>
  AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/common/v2.0
  ```

**Google** (Google Cloud Console → APIs & Services → Credentials → OAuth client ID, type Web):
- Authorized redirect URI: `https://app.roamhub360.com/api/auth/callback/google`
- Set:
  ```
  AUTH_GOOGLE_ID=<client id>
  AUTH_GOOGLE_SECRET=<client secret>
  ```

First-time SSO users are auto-created as **Staff**; promote them in **Users & roles**.

## 7. Microsoft Graph (optional: email + Outlook calendar)
Set `AZURE_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `MAIL_FROM` (see `.env.example`).
Leave blank to disable — the app no-ops (bookings still work, just no email/calendar).

## 8. Scheduled jobs (check-in reminders, auto-cancel, the "who's in" digest, etc.)
Add a host cron that pings the tick endpoint every 30 min:
```bash
*/30 * * * * curl -fsS -H "x-jobs-secret: <JOBS_SECRET>" https://app.roamhub360.com/api/jobs/tick >/dev/null 2>&1
```
(In Coolify, use a Scheduled Task instead.) Each site fires its tasks at its own local time:
`digest` 07:30 (Team Build-Up D — the daily "who's in" email, opt-in per user under **Settings**),
`checkin` 08:00, `auto-release` 09:30, `checkout` 17:00, `auto-checkout` 17:30, `reminder` 18:00.
All emails need Microsoft Graph (§7); without it they no-op. You can trigger one task for every
site manually, e.g. `curl -H "x-jobs-secret: …" https://app.roamhub360.com/api/jobs/digest`.

Each `tick` also runs **licence-expiry checks** (CP4): customer workspaces are warned at 90/60/30/
14/7/1/0 days before expiry (emailed to their admins + `OPS_EMAIL`), each band sent once. Run it on
demand with `curl -H "x-jobs-secret: …" https://app.roamhub360.com/api/jobs/license-check`.

**Monthly ROI report (G4):** a separate task emails last month's utilisation (bookings, check-in %,
no-show %, utilisation by type, busiest day) to a workspace's admins. Schedule it on the 1st:
```bash
0 7 1 * * curl -fsS -H "x-jobs-secret: <JOBS_SECRET>" https://app.roamhub360.com/api/jobs/report >/dev/null 2>&1
```

## 9. Private demo gate (before real auth is in front of prospects)
To password-protect the whole site (plain-compose path), uncomment `basic_auth` in `Caddyfile`:
```bash
docker run --rm caddy caddy hash-password --plaintext 'demo-password'   # paste the hash into Caddyfile
docker compose restart caddy
```

## 10. Backups
Back up the Postgres volume regularly:
```bash
docker compose exec -T db pg_dump -U roamhub roamhub360 | gzip > roamhub360-$(date +%F).sql.gz
```
Also back up the `appdata` volume (floor plans / images).

---

### Quick reference — what runs where
| Concern | Solution | Cost |
|---|---|---|
| Compute | Docker on the droplet (Next.js standalone) | droplet |
| Database | Postgres container + volume | free |
| File storage (plans/images) | local `appdata` volume | free |
| TLS + domain | Caddy (Path 1) or Coolify/Traefik (Path 2) | free |
| Auth | Auth.js — local + Entra + Google | free |
| Email / calendar | Microsoft Graph (unchanged) | free |
| Cron | host crontab → `/api/jobs/tick` | free |

---

## 11. Co-hosting alongside another app (e.g. the BlueShift helpdesk)

The demo can share the droplet that already runs another app — **without touching it**. Use the
co-host compose (`docker-compose.cohost.yml`): no Caddy, no 80/443 binding, its own Postgres +
volumes + project name (`roamhub360`). The app is published only on `127.0.0.1:3100`; your existing
reverse proxy forwards a subdomain to it.

**App URL:** `app.roamhub360.com` (RoamHub360's own domain; the helpdesk stays on `helpdesk.techhubaustralia.com.au`).
Add a DNS A record `app.roamhub360.com` → the droplet's IP.

### Bring it up
```bash
cd roamhub360 && cp .env.example .env    # set APP_URL=https://app.roamhub360.com
# (set APP_PORT in .env if 3100 is already taken by the other app)
docker compose -f docker-compose.cohost.yml up -d --build
docker compose -f docker-compose.cohost.yml run --rm migrate node scripts/create-admin.mjs you@techhubaustralia.com.au 'a-strong-password' 'Your Name'
```

### Route the subdomain — using whichever proxy the helpdesk already runs

**Coolify** — skip the co-host compose. In Coolify add a new Application (Dockerfile, target
`runner`, port 3000) + a PostgreSQL database, set the env, and set the domain
`app.roamhub360.com`; Coolify's proxy issues TLS. Run migrate/seed via a one-off
(see §5 / Path 2).

**Nginx** — add a server block, then issue a cert:
```nginx
server {
  server_name app.roamhub360.com;
  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
```bash
certbot --nginx -d app.roamhub360.com
```

**Caddy** — add to the existing Caddyfile:
```
app.roamhub360.com {
  reverse_proxy 127.0.0.1:3100
}
```

OAuth redirect URIs then use the subdomain, e.g. `https://app.roamhub360.com/api/auth/callback/google`.

---

## 12. Multi-tenant subdomains (`<customer>.roamhub360.com`)

Once you onboard customers on the **Tenants** page, each gets an isolated workspace at
`<slug>.roamhub360.com`. Two one-time infra steps:

1. **Wildcard DNS** — add an A record `*.roamhub360.com` → the droplet IP (`170.64.215.131`).
   (Cloudflare: DNS-only / grey cloud.)

2. **Caddy wildcard + on-demand TLS** — the app already routes by subdomain; Caddy just needs to
   serve any `<slug>.roamhub360.com`. Standard (native) Caddy does this with **on-demand TLS**,
   gated by the app's verify endpoint so only real workspaces ever get a certificate.

   Add a **global block at the very TOP** of `/etc/caddy/Caddyfile`:
   ```
   {
       on_demand_tls {
           ask http://127.0.0.1:3100/api/tenants/verify
       }
   }
   ```
   and a **wildcard site block** (leave the explicit `app.roamhub360.com` and helpdesk blocks as
   they are — a more specific host always wins):
   ```
   *.roamhub360.com {
       tls {
           on_demand
       }
       reverse_proxy 127.0.0.1:3100
   }
   ```
   Then `systemctl reload caddy`.

Creating a workspace `acme` on the Tenants page then makes `https://acme.roamhub360.com` live
automatically (Caddy fetches the cert on first visit, after `/api/tenants/verify` confirms the
workspace exists). Members of one workspace can't see another's — the membership guard + tenant
data scoping enforce it server-side.

---

## 13. Microsoft Teams tab (SSO, no separate login)

The app ships a Teams personal-tab manifest (`teams/manifest.json`). Inside Teams, `/teams`
obtains the user's Entra token via teams-js and exchanges it for an Auth.js session through the
`teams-sso` credentials provider — **no password, no redirect**. This replaces the old Azure
Easy Auth bridge that only worked while the app ran on Azure.

**Requires** the Entra SSO app from §6 (i.e. `AUTH_MICROSOFT_ENTRA_ID_ID` set). Then, one-time,
on that same Entra app registration:

1. **Expose an API** → *Application ID URI* = `api://app.roamhub360.com/<client-id>`
   (Azure suggests `api://<client-id>`; change the host to your APP_URL host so it matches the
   manifest). Add a scope `access_as_user` (admins + users can consent).
2. **Pre-authorise the Teams client IDs** for that scope (Add a client application):
   - `1fec8e78-bce4-4aaf-ab1b-5451cc387264` (Teams desktop/mobile)
   - `5e3ce6c0-2b1f-4285-8d4b-75ee78787346` (Teams web)
3. **API permissions** → add delegated `openid`, `profile`, `email` → **Grant admin consent**.
4. In `teams/manifest.json` replace `REPLACE_WITH_ENTRA_APP_CLIENT_ID` (three places) with the
   client id. `webApplicationInfo.resource` must equal the Application ID URI from step 1.

The app auto-derives the accepted token audience from `APP_URL` (`api://<host>/<client-id>`); set
`TEAMS_SSO_AUDIENCE` only if your Application ID URI differs from that pattern.

**Package + sideload:** zip `manifest.json` + `color.png` + `outline.png` (192×192 / 32×32) into
`roamhub360-teams.zip`, then Teams → Apps → *Manage your apps* → *Upload an app* (or admin-publish
org-wide). First-time Teams users are provisioned as **Staff**, same as web SSO.

**Tabs (Team Build-Up E):** the manifest ships personal tabs (Home, Book, My bookings, **Who's in**)
and a **configurable channel tab** — in any Teams channel, *+ Add a tab → RoamHub360* pins the
**Who's in** presence board so the whole team sees who's booked/checked in (config page:
`/teams/config`; the tab renders `/teams?target=/team` through the SSO bridge). No extra setup
beyond the SSO app above.

---

## 14. Directory sync — real names, photos & departments (Team Build-Up B)

"Who's in" (and future team features) can show real profiles from the customer's Microsoft Entra
directory instead of names guessed from email addresses. It reuses the Graph app from §7.

1. On that Entra app, add the **application** permission **`User.Read.All`** (Microsoft Graph) →
   **Grant admin consent**. (Email/calendar use `Mail.Send` + `Calendars.ReadWrite`; this is
   additive.)
2. Ensure `AZURE_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` are set (same as §7).
3. Sign in as a **Global Admin** → **Directory** (sidebar) → **Sync from Microsoft 365**.

The sync pages `/users` (name, title, department, office, manager) and fetches 48px photos,
caching them per-tenant in `DirectoryUser`. Re-run it whenever the directory changes (or wire the
`POST /api/directory` endpoint to a scheduled task later). With Graph unset, the page shows a
"not configured" note and the app keeps using email-derived names — nothing breaks.

> Per-**customer** Graph credentials (so each tenant syncs *their own* directory) arrive with the
> Customer Admin Portal in the commercial phase; today the sync uses the deployment's single Graph app.
