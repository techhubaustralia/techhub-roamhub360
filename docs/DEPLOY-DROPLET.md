# RoamHub360 — self-hosted deployment (DigitalOcean droplet + Coolify)

Cheap, always-on hosting off Azure. One Sydney droplet runs **Postgres + the app + TLS**.
Everything Microsoft-integrated (Graph email/calendar, Entra SSO) keeps working; storage is
a local volume (no Azure Blob). Est. cost **~AU$18/mo**.

There are two paths. **Path 1 (plain Docker Compose)** is the simplest and is what the repo's
`docker-compose.yml` is built for. **Path 2 (Coolify)** adds a web UI + git-push deploys.

---

## 0. Prerequisites
- A DigitalOcean account.
- A domain you control (e.g. `roamhub360.com`) so we can point `demo.roamhub360.com` at the droplet.
- OAuth apps (optional, for SSO) — see §6.

## 1. Create the droplet
- **Droplet type:** Basic · Regular · **2 GB RAM / 1 vCPU** (min; 1 GB is tight with Postgres).
- **Region:** **Sydney (SYD1)**.
- **Image:** Ubuntu 24.04 LTS.
- Add your SSH key. Enable the DO firewall: allow **22, 80, 443**.

## 2. DNS
Point an **A record** `demo.roamhub360.com` → the droplet's public IP. (TLS is issued automatically once DNS resolves.)

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
```
Edit `.env` and set at minimum:
```
POSTGRES_PASSWORD=<strong>
DATABASE_URL=postgresql://roamhub:<same strong password>@db:5432/roamhub360?schema=public
SITE_ADDRESS=demo.roamhub360.com
APP_URL=https://demo.roamhub360.com
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
Now open `https://demo.roamhub360.com` → sign in with that email/password.

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
5. **Set the domain** `demo.roamhub360.com` in the app's settings — Coolify issues TLS.
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
- Redirect URI (Web): `https://demo.roamhub360.com/api/auth/callback/microsoft-entra-id`
- Supported account types: *Accounts in any organizational directory* (multi-tenant).
- Create a client secret. Set:
  ```
  AUTH_MICROSOFT_ENTRA_ID_ID=<application (client) id>
  AUTH_MICROSOFT_ENTRA_ID_SECRET=<client secret value>
  AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/common/v2.0
  ```

**Google** (Google Cloud Console → APIs & Services → Credentials → OAuth client ID, type Web):
- Authorized redirect URI: `https://demo.roamhub360.com/api/auth/callback/google`
- Set:
  ```
  AUTH_GOOGLE_ID=<client id>
  AUTH_GOOGLE_SECRET=<client secret>
  ```

First-time SSO users are auto-created as **Staff**; promote them in **Users & roles**.

## 7. Microsoft Graph (optional: email + Outlook calendar)
Set `AZURE_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `MAIL_FROM` (see `.env.example`).
Leave blank to disable — the app no-ops (bookings still work, just no email/calendar).

## 8. Scheduled jobs (check-in reminders, auto-cancel, etc.)
Add a host cron that pings the tick endpoint every 30 min:
```bash
*/30 * * * * curl -fsS -H "x-jobs-secret: <JOBS_SECRET>" https://demo.roamhub360.com/api/jobs/tick >/dev/null 2>&1
```
(In Coolify, use a Scheduled Task instead.)

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

**Suggested subdomain:** `roamhub360.techhubaustralia.com.au` (matches `helpdesk.techhubaustralia.com.au`).
Add a DNS A record → the droplet's IP.

### Bring it up
```bash
cd roamhub360 && cp .env.example .env    # set APP_URL=https://roamhub360.techhubaustralia.com.au
# (set APP_PORT in .env if 3100 is already taken by the other app)
docker compose -f docker-compose.cohost.yml up -d --build
docker compose -f docker-compose.cohost.yml run --rm migrate node scripts/create-admin.mjs you@techhubaustralia.com.au 'a-strong-password' 'Your Name'
```

### Route the subdomain — using whichever proxy the helpdesk already runs

**Coolify** — skip the co-host compose. In Coolify add a new Application (Dockerfile, target
`runner`, port 3000) + a PostgreSQL database, set the env, and set the domain
`roamhub360.techhubaustralia.com.au`; Coolify's proxy issues TLS. Run migrate/seed via a one-off
(see §5 / Path 2).

**Nginx** — add a server block, then issue a cert:
```nginx
server {
  server_name roamhub360.techhubaustralia.com.au;
  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
```bash
certbot --nginx -d roamhub360.techhubaustralia.com.au
```

**Caddy** — add to the existing Caddyfile:
```
roamhub360.techhubaustralia.com.au {
  reverse_proxy 127.0.0.1:3100
}
```

OAuth redirect URIs then use the subdomain, e.g. `https://roamhub360.techhubaustralia.com.au/api/auth/callback/google`.
