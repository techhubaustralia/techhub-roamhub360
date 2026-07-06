# Workspace Hub — Microsoft Teams app

Path A: a **Teams personal-tab app that wraps the existing web app**. One codebase — the
tabs load the live web URLs, so every web deploy is reflected in Teams automatically with no
separate feature work. RBAC (Staff / Site Admin / Global Admin) is enforced by the same
backend, so nothing role-related is duplicated here.

## What's in this folder
- `manifest.json` — Teams app manifest (personal tabs: Home, Book a space, My bookings).
- `color.png` — **192×192** app icon (you add — full colour, opaque).
- `outline.png` — **32×32** app icon (you add — white on transparent).

## One-time setup (tenant admin / infra — cannot be done from the repo)

### 1. Entra app registration (SSO)
1. Register (or reuse) an Entra app for the web app.
2. Expose an API: **Application ID URI** = `api://workspace.sodali.com/<APP_CLIENT_ID>`.
3. Add a scope `access_as_user` (admin + user consent).
4. Pre-authorise the Teams client IDs on that scope:
   - `1fec8e78-bce4-4aaf-ab1b-5451cc387264` (Teams desktop/mobile)
   - `5e3ce6c0-2b1f-4285-8d4b-75ee78787346` (Teams web)
5. Redirect URI (SPA/web): `https://workspace.sodali.com/auth-end` (if you add the Teams JS auth-end page).

### 2. Fill the manifest
Replace `REPLACE_WITH_ENTRA_APP_CLIENT_ID` (3 places: `id`, `webApplicationInfo.id`,
`webApplicationInfo.resource`) with the Entra **Application (client) ID**.

### 3. SSO token flow (Teams Toolkit pattern)
- In the tab, call `microsoftTeams.authentication.getAuthToken()` to get an Entra token for the
  signed-in Teams user (silent SSO).
- Exchange it **on-behalf-of** for a Graph/back-end token, or pass it to the backend as a Bearer
  token. NOTE: the web app currently authenticates via **Container Apps Easy Auth** (cookie).
  For seamless Teams SSO, add a small `/auth-start` + `/auth-end` bridge that acquires the Teams
  token and establishes the Easy Auth session, OR configure Easy Auth to accept the Teams-issued
  Bearer token audience. This is the only real integration work; the rest is config.

### 4. Package + upload
```bash
cd teams
zip workspace-hub-teams.zip manifest.json color.png outline.png
```
Upload `workspace-hub-teams.zip` in **Teams admin center → Manage apps → Upload**, or sideload
via **Teams → Apps → Manage your apps → Upload a custom app** for testing.

## Deployment (Azure DevOps)
- Web deploy is unchanged — the tabs point at the live URL, so shipping the web app ships Teams.
- Version bump: keep `manifest.json` `version` in step with web releases; re-upload the zip only
  when the manifest itself changes (tabs, icons, scopes) — not for ordinary web deploys.
- Add a pipeline artifact step that zips this folder so the package is versioned alongside builds.

## Config across Dev / Test / Prod
Keep one manifest per environment (different `id`, URLs, `validDomains`) or template the domain
and inject per-environment in the pipeline. Prod uses `workspace.sodali.com`.

## Not done here (needs your infra + cannot be validated locally)
- Entra app registration, API scope, admin consent.
- Teams admin upload/approval.
- The Easy-Auth ↔ Teams-SSO token bridge (design decision above).
- Real icon PNGs.
